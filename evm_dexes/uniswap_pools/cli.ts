import { createLogger, formatNumber } from '../../examples/utils';
import {
  FACTORY_DEPLOYED_AT,
  UniswapPoolStream,
} from '../../streams/uniswap_pools/uniswap_pool_stream';
import { HttpClient } from '@subsquid/http-client';
import { SqliteState } from '../../core/states/sqlite_state';
import { DatabaseSync } from 'node:sqlite';

async function main() {
  const logger = createLogger('uniswap_pools');

  const db = new DatabaseSync('./uniswap-pools.db');

  const ds = new UniswapPoolStream({
    portal: {
      url: 'https://portal.sqd.dev/datasets/ethereum-mainnet',
      http: new HttpClient({
        retryAttempts: 10,
      }),
    },
    args: {
      fromBlock: FACTORY_DEPLOYED_AT,
    },
    logger,
    state: new SqliteState(db, {table: 'uniswap_sync_status', id: 'uniswap_pools'}),
    onStart: async ({current, initial}) => {
      if (initial.number === current.number) {
        logger.info(`Syncing from ${formatNumber(current.number)}`);
        return;
      }

      logger.info(`Resuming from ${formatNumber(current.number)}`);
    },
    onProgress: ({state, interval}) => {
      logger.info({
        message: `${formatNumber(state.current)} / ${formatNumber(state.last)} (${formatNumber(state.percent)}%)`,
        speed: `${interval.processedPerSecond} blocks/second`,
      });
    },
  });

  db.exec(
    'CREATE TABLE IF NOT EXISTS uniswap_pools (pool TEXT PRIMARY KEY, token_a TEXT, token_b TEXT)',
  );

  const insert = db.prepare(
    'INSERT OR IGNORE INTO uniswap_pools (pool, token_a, token_b) VALUES (?, ?, ?)',
  );

  for await (const pools of await ds.stream()) {
    for await (const pool of pools) {
      insert.run(pool.pool, pool.tokenA, pool.tokenB);
    }

    await ds.ack(pools);
  }
}

void main();
