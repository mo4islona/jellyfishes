import path from 'node:path';
import { createClickhouseClient, ensureTables, toUnixTime } from '../../clickhouse';
import { createLogger, formatNumber } from '../../utils';
import { getConfig } from '../config';
import { HolderCounter } from './holder_counter';
import { createClient } from '@clickhouse/client';
import { ClickHouseLogLevel } from '@clickhouse/client-common';
const config = getConfig();

const clickhouse = createClient({
  url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
  username: process.env.CLICKHOUSE_USER || 'default',
  password: process.env.CLICKHOUSE_PASSWORD || '',
  request_timeout: 400_000,
  clickhouse_settings: {
    send_progress_in_http_headers: 1,
    http_headers_progress_interval_ms: '110000',
  },
  log: {
    level: ClickHouseLogLevel.ERROR,
  },
});
const logger = createLogger('erc20');
logger.info('extended logging added');

async function tryMultipleTimes<T>(f: () => Promise<T>, whatInserting: string) {
  for (let i = 0; i < 3; i++) {
    try {
      return await f();
    } catch (e) {
      logger.error(`Error inserting ${whatInserting}: ${e}`);
    }
  }
  throw new Error(`Failed to insert ${whatInserting} after 3 attempts`);
}

async function checkExistingRows(table: string): Promise<boolean> {
  // Check if there are already rows in the specified table for this network
  const checkQuery = `
    SELECT count() as count
    FROM ${table}
    WHERE network = {network: String}
  `;

  const checkResult = await clickhouse.query({
    query: checkQuery,
    query_params: {
      network: config.network,
    },
    format: 'JSONEachRow',
  });

  const rowCount = parseInt(((await checkResult.json()) as any)[0].count);
  if (rowCount > 0) {
    logger.error(
      `Found ${rowCount} existing rows in ${table} for network ${config.network}. Exiting to prevent duplicate data.`,
    );
    return true;
  }
  return false;
}

async function main() {
  if (!config.collectData) {
    throw new Error('COLLECT_DATA is not set');
  }

  const toCollect = config.collectData.split(',').filter(Boolean);
  const collectHolders = toCollect.includes('holders');
  const collectFirstMints = toCollect.includes('first_mints');

  await ensureTables(clickhouse, path.join(__dirname, 'erc20_transfers.sql'));

  try {
    if (collectHolders && (await checkExistingRows('evm_erc20_holders'))) {
      process.exit(1);
    }

    if (collectFirstMints && (await checkExistingRows('evm_erc20_first_mints'))) {
      process.exit(1);
    }

    logger.info(
      `Starting to fetch ${collectHolders ? 'holders' : ''} ${collectFirstMints ? 'first_mints' : ''}...`,
    );

    // Query to fetch ERC20 transfers filtered by network.
    // We select only tra
    const query = `
        WITH active_tokens AS (
            SELECT token, network, swap_count
            FROM evm_token_swap_counts_mv FINAL
            WHERE network = {network: String} 
                AND swap_count > 1000
        ),
        active_token_transfers AS (
            SELECT *
            FROM evm_erc20_transfers t
            WHERE network = {network: String} AND "token" IN (SELECT token FROM active_tokens ac_t)
            ORDER BY timestamp, transaction_index, log_index
        )
        SELECT *
        FROM active_token_transfers
    `;

    let totalInserted = 0;

    // Execute the query
    const resultSet = await clickhouse.query({
      query,
      query_params: {
        to_select: '*',
        network: config.network,
      },
      format: 'JSONEachRow',
    });

    let firstMintsBuffer: {
      timestamp: string;
      network: string;
      token: string;
      transactionHash: string;
    }[] = [];

    const holderCounter = new HolderCounter(
      logger,
      collectHolders
        ? async (timestamp, holders) => {
            const values = holders.map((h) => ({
              timestamp,
              network: config.network,
              token: h.token,
              holders: h.holderCount,
              sign: 1,
            }));

            await tryMultipleTimes(
              async () =>
                clickhouse.insert({
                  table: 'evm_erc20_holders',
                  values,
                  format: 'JSONEachRow',
                }),
              'holders',
            );
            totalInserted += values.length;
          }
        : undefined,
      collectFirstMints
        ? async (timestamp, token, transactionHash) => {
            firstMintsBuffer.push({ timestamp, network: config.network, token, transactionHash });

            if (firstMintsBuffer.length >= 100) {
              logger.info(`Flushing ${firstMintsBuffer.length} first mints to ClickHouse`);
              const values = firstMintsBuffer.map((m) => ({ ...m }));
              firstMintsBuffer = [];

              await tryMultipleTimes(
                async () =>
                  clickhouse.insert({
                    table: 'evm_erc20_first_mints',
                    values,
                    format: 'JSONEachRow',
                  }),
                'first_mints',
              );
            }
          }
        : undefined,
    );

    let countProcessed = 0;
    for await (const rows of resultSet.stream()) {
      for (const row of rows) {
        const transfer = row.json() as any;

        if (transfer.exception) {
          logger.error(`CH error: ${transfer.exception}`);
          process.exit(1);
        }

        await holderCounter.processTransfer(transfer);
        countProcessed++;
        if (countProcessed % 500_000 === 0) {
          logger.info(
            `Processed ${countProcessed} rows, current date ${transfer.timestamp}, inserted ${totalInserted}`,
          );
          holderCounter.printState();
        }
      }
    }

    if (firstMintsBuffer.length > 0) {
      logger.info(`Flushing last ${firstMintsBuffer.length} mints to ClickHouse`);
      await clickhouse.insert({
        table: 'evm_erc20_first_mints',
        values: firstMintsBuffer,
        format: 'JSONEachRow',
      });
    }

    logger.info(
      `Finished processing ERC20 transfers. ${countProcessed} rows read, ${totalInserted} rows added. Final state:`,
    );
    holderCounter.printState();
  } catch (error) {
    logger.error(`Error processing ERC20 transfers: ${error}`);
    if (error instanceof Error) {
      logger.error(`Error stack trace: ${error.stack}`);
    }
  }
}

void main();
