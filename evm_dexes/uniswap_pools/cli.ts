import { createLogger, formatNumber } from '../../examples/utils';
import {
  FACTORY_DEPLOYED_AT,
  UniswapPoolStream,
} from '../../streams/uniswap_pools/uniswap_pool_stream';
import { ClassicLevel } from 'classic-level';
import { LevelDbState } from '../../core/states/leveldb_state';
import { HttpClient } from '@subsquid/http-client';

async function main() {
  const logger = createLogger('uniswap_pools');

  const db = new ClassicLevel('./db', {valueEncoding: 'json'});

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
    state: new LevelDbState(db, {id: 'uniswap_pools'}),
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

  for await (const pools of await ds.stream()) {
    await db.batch<string, any>(
      pools.map(({pool, tokenA, tokenB}) => ({
        type: 'put',
        key: pool,
        value: {tokenA, tokenB},
      })),
      {valueEncoding: 'json'},
    );

    await ds.ack(pools);
  }
}

void main();
