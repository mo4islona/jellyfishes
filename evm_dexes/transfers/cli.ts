import path from 'node:path';
import { ClickhouseState } from '../../core/states/clickhouse_state';
import { createLogger, formatNumber } from '../../examples/utils';
import { cleanAllBeforeOffset, createClickhouseClient, ensureTables, toUnixTime, } from '../../solana_dexes/clickhouse';
import { getConfig } from '../config';
import { Erc20Stream } from '../../streams/erc20/erc20_stream';

const DECIMALS = {
  'base-mainnet': {
    ['0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'.toLowerCase()]: 6, // USDC
    ['0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2'.toLowerCase()]: 6, // USDT
  },
  'ethereum-mainnet': {
    ['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'.toLowerCase()]: 6, // USDC
    ['0xdac17f958d2ee523a2206206994597c13d831ec7'.toLowerCase()]: 6, // USDT
  },
};

function denominate(network: string, address: string, amount: bigint) {
  const decimals = address ? DECIMALS[network][address] || 18 : 18;

  return Number(amount) / 10 ** decimals;
}

const config = getConfig();

const clickhouse = createClickhouseClient();
const logger = createLogger('erc20').child({network: config.network});

async function main() {
  const ds = new Erc20Stream({
    portal: config.portal.url,
    args: {
      fromBlock: 0,
    },
    logger,
    state: new ClickhouseState(clickhouse, {
      table: 'evm_sync_status',
      id: `erc20-transfers-${config.network}-v2`,
    }),
    onStart: async ({current, initial}) => {
      /**
       * Clean all data before the current offset.
       * There is a small chance if the stream is interrupted, the data will be duplicated.
       * We just clean it up at the start to avoid duplicates.
       */
      await cleanAllBeforeOffset(
        {clickhouse, logger},
        {
          table: 'evm_erc20_transfers',
          column: 'timestamp',
          offset: current.timestamp,
          filter: `network = '${config.network}'`,
        },
      );

      if (initial.number === current.number) {
        logger.info(`Syncing from ${formatNumber(current.number)}`);
        return;
      }
      const ts = new Date(current.timestamp * 1000);

      logger.info(`Resuming from ${formatNumber(current.number)} produced ${ts.toISOString()}`);
    },
    onProgress: ({state, interval}) => {
      logger.info({
        message: `${formatNumber(state.current)} / ${formatNumber(state.last)} (${formatNumber(state.percent)}%)`,
        speed: `${interval.processedPerSecond} blocks/second`,
      });
    },
  });

  await ensureTables(clickhouse, path.join(__dirname, 'erc20_transfers.sql'));

  for await (const transfers of await ds.stream()) {
    await clickhouse.insert({
      table: 'evm_erc20_transfers',
      values: transfers.map((t) => {
        return {
          network: config.network,
          block_number: t.block.number,
          transaction_hash: t.transaction.hash,
          transaction_index: t.transaction.index,
          log_index: t.transaction.logIndex,
          token: t.token_address,
          from: t.from,
          to: t.to,
          amount: denominate(config.network, t.token_address, t.amount).toString(),
          timestamp: toUnixTime(t.timestamp),
          sign: 1,
        };
      }),
      format: 'JSONEachRow',
    });

    await ds.ack();
  }
}

void main();
