import { createLogger, formatNumber } from '../../examples/utils';
import { UniswapPoolStream } from '../../streams/uniswap_pools/uniswap_pool_stream';
import { HttpClient } from '@subsquid/http-client';
import { SqliteState } from '../../core/states/sqlite_state';
import { DatabaseSync } from 'node:sqlite';
import { getConfig } from '../config';

const config = getConfig();

async function main() {
  const logger = createLogger(`uniswap.v3 pools`).child({network: config.network});

  const db = new DatabaseSync(config.dbPath);
  db.exec('PRAGMA journal_mode = WAL');

  logger.info(`Local database: ${config.dbPath}`);

  const ds = new UniswapPoolStream({
    portal: {
      url: config.portal.url,
      http: new HttpClient({
        retryAttempts: 10,
      }),
    },
    args: {
      fromBlock: config.factory.block.number,
    },
    logger,
    state: new SqliteState(db, {
      table: 'uniswap_sync_status',
      network: `pools-${config.network}`,
    }),
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
    'CREATE TABLE IF NOT EXISTS uniswap_pools (pool TEXT PRIMARY KEY, token_a TEXT, token_b TEXT, factory_address TEXT)',
  );

  const insert = db.prepare('INSERT OR IGNORE INTO uniswap_pools VALUES (?, ?, ?, ?)');

  for await (const pools of await ds.stream()) {
    // TODO Do we need batch insert here? On local laptop with fast SSD is 50-100ms
    for await (const pool of pools) {
      insert.run(pool.pool, pool.tokenA, pool.tokenB, pool.factoryAddress);
    }

    await ds.ack(pools);
  }
}

void main();
