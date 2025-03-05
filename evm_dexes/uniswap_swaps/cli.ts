import path from 'node:path';
import { ClickhouseState } from '../../core/states/clickhouse_state';
import { createLogger, formatNumber } from '../../examples/utils';
import {
  cleanAllBeforeOffset,
  createClickhouseClient,
  ensureTables,
  toUnixTime,
} from '../../solana_dexes/clickhouse';
import { UniswapSwap, UniswapSwapStream } from '../../streams/uniswap_swaps/uniswap_swap_stream';
import { uniq } from 'lodash';
import * as process from 'node:process';
import { DatabaseSync } from 'node:sqlite';

function denominate(amount: bigint) {
  return Number(amount) / 10 ** 18;
}

const db = new DatabaseSync('./uniswap-pools.db', {readOnly: true});

const clickhouse = createClickhouseClient();
const logger = createLogger('unswap_swaps');

const POOLS = {
  '0x1f98431c8ad98523631ae4a59f267346ea31f984': 'uniswap_v3',
};

type PoolMetadata = { pool: string; token_a: string; token_b: string; factory_address: string };

function getPoolMetadata(swaps: UniswapSwap[]): Record<string, PoolMetadata> {
  const pools = uniq(swaps.map((s) => s.pool));

  const params = new Array(pools.length).fill('?').join(',');
  const select = db.prepare(`
      SELECT *
      FROM "uniswap_pools"
      WHERE "pool" IN (${params})
  `);

  const poolsMetadata = select.all(...pools) as PoolMetadata[];

  return poolsMetadata.reduce(
    (res, pool) => ({
      ...res,
      [pool.pool]: pool,
    }),
    {},
  );
}

async function main() {
  const ds = new UniswapSwapStream({
    portal: 'https://portal.sqd.dev/datasets/ethereum-mainnet',
    args: {
      fromBlock: 12369621,
    },
    logger,
    state: new ClickhouseState(clickhouse, {
      table: 'evm_sync_status',
      id: 'uniswap_swaps',
    }),
    onStart: async ({current, initial}) => {
      /**
       * Clean all data before the current offset.
       * There is a small chance if the stream is interrupted, the data will be duplicated.
       * We just clean it up at the start to avoid duplicates.
       */
      await cleanAllBeforeOffset(
        {clickhouse, logger},
        {table: 'uniswap_v3_swaps_raw', column: 'block_number', offset: current.number},
      );

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

  await ensureTables(clickhouse, path.join(__dirname, 'swaps.sql'));

  for await (const swaps of await ds.stream()) {
    const pools = getPoolMetadata(swaps);

    await clickhouse.insert({
      table: 'uniswap_v3_swaps_raw',
      values: swaps
        // .filter((s) => s.amount0 > 0 && s.amount1 > 0)
        .map((s, index) => {
          const pool = pools[s.pool];
          if (!pool) {
            // TODO improve message, maybe we have to wait until metadata is ready?
            logger.error(`There is no metadata for a pool ${s.pool}`);
            process.exit();
          }

          return {
            dex: POOLS[s.pool] || s.pool,
            block_number: s.block.number,
            transaction_hash: s.transaction.hash,
            transaction_index: s.transaction.index,
            account: s.sender,
            token_a: pool.token_a,
            token_b: pool.token_b,
            amount_a: denominate(s.amount0).toString(),
            amount_b: denominate(s.amount1).toString(),
            timestamp: toUnixTime(s.timestamp),
            sign: 1,
          };
        }),
      format: 'JSONEachRow',
    });

    await ds.ack(swaps);
  }
}

void main();
