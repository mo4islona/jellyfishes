import { createClient } from '@clickhouse/client';
import { ClickhouseState } from '../core/states/clickhouse_state';
import { Erc20Stream } from '../streams/erc20/erc20_stream';
import { createLogger, formatNumber } from './utils';

async function main() {
  /**
   * Initialize Clickhouse client
   */
  const clickhouse = createClient({
    url: 'http://localhost:8123',
    password: '',
  });

  const logger = createLogger('erc20');

  /**
   * Initialize Erc20 datasource with the following parameters:
   */
  const dataSource = new Erc20Stream({
    portal: 'https://portal.sqd.dev/datasets/ethereum-mainnet',
    args: {
      fromBlock: 4634748,
      contracts: ['0xdac17f958d2ee523a2206206994597c13d831ec7'],
    },
    logger,
    /**
     *  Current streaming progress will be stored in the 'status_erc20' Clickhouse table.
     *  The table will be created if it does not exist.
     *  If the table already exists, the last processed block will be read from it,
     *  thus allowing the process to continue from the last block.
     */
    state: new ClickhouseState(clickhouse, {
      table: 'status_erc20',
    }),
    /**
     * Track the progress of the streaming process.
     * It will simply log the current block number, the head block number, and the speed of the process every 5 seconds.
     */
    onProgress: ({state, interval}) => {
      logger.info({
        message: `${formatNumber(state.current)} / ${formatNumber(state.last)} (${formatNumber(state.percent)}%)`,
        speed: `${interval.processedPerSecond} blocks/second`,
      });
    },
  });

  /**
   * Create the 'erc20_transfers' table in Clickhouse if it does not exist.
   */
  await clickhouse.command({
    query: `
        CREATE TABLE IF NOT EXISTS erc20_transfers
        (
            block_number UInt32,
            from         String,
            to           String,
            token        LowCardinality(String),
            amount       Int64,
            timestamp    DateTime,
            tx           String
        ) ENGINE = MergeTree()
      ORDER BY (timestamp, token)
    `,
  });

  for await (const erc20 of await dataSource.stream()) {
    await clickhouse.insert({
      table: 'erc20_transfers',
      values: erc20.map((e) => ({
        token: e.token_address,
        from: e.from,
        to: e.to,
        amount: e.amount.toString(),
        block_number: e.block.number,
        tx: e.tx,
        timestamp: Math.round(e.timestamp.getTime() / 1000),
      })),
      format: 'JSONEachRow',
    });

    /**
     * Ack progress
     */
    await dataSource.ack();

    logger.debug(`processed ${erc20.length} erc20 transfers`);
  }
}

void main();
