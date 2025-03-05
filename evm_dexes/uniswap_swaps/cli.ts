import path from 'node:path';
import { ClickhouseState } from '../../core/states/clickhouse_state';
import { createLogger, formatNumber } from '../../examples/utils';
import {
  cleanAllBeforeOffset,
  createClickhouseClient,
  ensureTables,
  toUnixTime,
} from '../../solana_dexes/clickhouse';
import { getSortFunction } from '../../solana_dexes/swaps/util';
import { ClassicLevel } from 'classic-level';
import { UniswapSwap, UniswapSwapStream } from '../../streams/uniswap_swaps/uniswap_swap_stream';
import { uniq } from 'lodash';
import * as process from 'node:process';

function denominate(amount: bigint) {
  return Number(amount) / 10 ** 18;
}

const poolMetadataDb = new ClassicLevel('./db', {valueEncoding: 'json'});
const clickhouse = createClickhouseClient();
const logger = createLogger('unswap_swaps');

async function getPoolMetadata(
  swaps: UniswapSwap[],
): Promise<Record<string, { tokenA: string; tokenB: string }>> {
  const pools = uniq(swaps.map((s) => s.pool));
  const poolsMetadata = await poolMetadataDb.getMany<string, { tokenA: string; tokenB: string }>(
    pools,
    {valueEncoding: 'json'},
  );

  return poolsMetadata.reduce(
    (res, pool, currentIndex) => ({
      ...res,
      [pools[currentIndex]]: pool,
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
    const pools = await getPoolMetadata(swaps);

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
            dex: 'uniswap_v3',
            block_number: s.block.number,
            transaction_hash: s.transaction.hash,
            transaction_index: s.transaction.index,
            account: s.sender,
            token_a: pool.tokenA,
            token_b: pool.tokenB,
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
