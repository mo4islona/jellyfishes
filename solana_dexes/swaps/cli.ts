import path from 'node:path';
import { ClickhouseProgress } from '../../core/states/clickhouse_state';
import { createLogger, formatNumber } from '../../examples/utils';
import { SolanaSwapsStream } from '../../streams/solana_swaps/solana_swaps';
import { createClickhouseClient, ensureTables, toUnixTime } from '../clickhouse';
import { getSortFunction } from './util';

const DECIMALS = {
  So11111111111111111111111111111111111111112: 9,
};

function denominate(amount: bigint, mint: string) {
  const decimals = DECIMALS[mint] || 6;

  return Number(amount) / 10 ** decimals;
}

const TRACKED_TOKENS = [
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'So11111111111111111111111111111111111111112', // SOL
];

const sortTokens = getSortFunction(TRACKED_TOKENS);

async function main() {
  const clickhouse = createClickhouseClient();
  const logger = createLogger('solana_swaps');

  const ds = new SolanaSwapsStream({
    portal: 'https://portal.sqd.dev/datasets/solana-mainnet',
    args: {
      fromBlock: 240_000_000,
      tokens: TRACKED_TOKENS,
    },
    state: new ClickhouseProgress(clickhouse, {
      table: 'solana_sync_status',
      id: 'dex_swaps',
    }),
    onStart: ({current, initial}) => {
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
      table: 'solana_swaps_raw',
      values: swaps.map((s) => {
        /**
         * Sort tokens naturally to preserve the same pair order, i.e., SOL/ORCA and never ORCA/SOL.
         */
        const needTokenSwap = sortTokens(s.input.mint, s.output.mint);

        const tokenA = !needTokenSwap ? s.input : s.output;
        const tokenB = !needTokenSwap ? s.output : s.input;

        return {
          dex: s.dex,
          block_number: s.block.number,
          transaction_hash: s.transaction.hash,
          transaction_index: s.transaction.index,
          account: s.account,
          token_a: tokenA.mint,
          token_b: tokenB.mint,
          a_to_b: !needTokenSwap,
          amount_a: denominate(tokenA.amount, tokenA.mint).toString(),
          amount_b: denominate(tokenB.amount, tokenB.mint).toString(),
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
