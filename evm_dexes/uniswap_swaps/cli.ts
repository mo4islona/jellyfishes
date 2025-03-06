import path from 'node:path';
import { ClickhouseState } from '../../core/states/clickhouse_state';
import { createLogger, formatNumber } from '../../examples/utils';
import {
  cleanAllBeforeOffset,
  createClickhouseClient,
  ensureTables,
  toUnixTime,
} from '../../solana_dexes/clickhouse';
import { UniswapSwapStream } from '../../streams/uniswap_swaps/uniswap_swap_stream';
import { getConfig } from '../config';

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
const logger = createLogger('unswap.v3 swaps').child({network: config.network});

logger.info(`Local database: ${config.dbPath}`);

async function main() {
  const ds = new UniswapSwapStream({
    portal: config.portal.url,
    args: {
      fromBlock: config.factory.block.number,
      factoryContract: config.factory.address,
      /**
       * Pool metadata is stored in a local SQLite database.
       * We need metadata to filter out pools that are not interesting to us
       * and to expand the pool into a list of tokens within it.
       */
      dbPath: config.dbPath,
    },
    logger,
    state: new ClickhouseState(clickhouse, {
      table: 'evm_sync_status',
      id: `swaps-${config.network}`,
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
          table: 'uniswap_v3_swaps_raw',
          column: 'block_number',
          offset: current.number,
          filter: `network = '${config.network}'`,
        },
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
    await clickhouse.insert({
      table: 'uniswap_v3_swaps_raw',
      values: swaps.map((s) => {
        return {
          factory_address: s.factory.address,
          network: config.network,
          block_number: s.block.number,
          transaction_hash: s.transaction.hash,
          transaction_index: s.transaction.index,
          log_index: s.transaction.logIndex,
          account: s.sender,
          token_a: s.tokenA.address,
          token_b: s.tokenB.address,
          amount_a: denominate(config.network, s.tokenA.address || '', s.tokenA.amount).toString(),
          amount_b: denominate(config.network, s.tokenB.address || '', s.tokenB.amount).toString(),
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
