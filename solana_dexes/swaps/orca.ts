import path from 'node:path';
import { PortalClient } from '@subsquid/portal-client';
import { ClickhouseProgress } from '../../core/states/clickhouse_progress';
import { TrackProgress } from '../../core/track_progress';
import { createLogger, formatNumber, last } from '../../examples/utils';
import { SolanaWhirlpoolStream } from '../../streams/solana_swaps/solana_whirpool';
import { createClickhouseClient, ensureTables, toUnixTime } from '../clickhouse';

const DECIMALS = {
  So11111111111111111111111111111111111111112: 9,
};

function denominate(amount: bigint, mint: string) {
  const decimals = DECIMALS[mint] || 6;

  return Number(amount) / 10 ** decimals;
}

const TRACKED_TOKENS = [
  'So11111111111111111111111111111111111111112', // SOL
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
];

const SORT_ORDER: Record<string, number> = TRACKED_TOKENS.reduce(
  (acc, token, index) => ({...acc, [token]: index + 1}),
  {},
);

function sortTokens(a: string, b: string) {
  const sort =
    (SORT_ORDER[b] || Number.MAX_SAFE_INTEGER) - (SORT_ORDER[a] || Number.MAX_SAFE_INTEGER);

  if (sort !== 0) return sort > 0;

  return a.localeCompare(b) > 0;
}

async function main() {
  const portal = new PortalClient({
    url: 'https://portal.sqd.dev/datasets/solana-mainnet',
  });

  const clickhouse = createClickhouseClient();
  const logger = createLogger('solana_swaps');

  const ds = new SolanaWhirlpoolStream({
    portal,
    args: {
      fromBlock: 240_000_000,
      tokens: TRACKED_TOKENS,
    },
    progress: new ClickhouseProgress(clickhouse, {
      table: 'solana_dex_status',
      id: 'orca',
    }),
  });

  await ensureTables(clickhouse, path.join(__dirname, 'tables'));

  const progress = new TrackProgress({
    portal,
    onProgress: ({blocks, interval}) => {
      logger.info({
        message: `${formatNumber(blocks.current)} / ${formatNumber(blocks.head)} (${formatNumber(blocks.percent_done)}%)`,
        speed: interval.speed,
      });
    },
  });

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
          dex: 'orca',

          block_number: s.block.number,
          transaction_hash: s.transaction.id,
          transaction_index: s.transaction.index,

          account: s.account,
          token_a: tokenA.mint,
          token_b: tokenB.mint,
          a_to_b: !needTokenSwap,
          amount_a: denominate(tokenA.amount, tokenA.mint).toString(),
          amount_b: denominate(tokenB.amount, tokenB.mint).toString(),

          timestamp: toUnixTime(s.timestamp),
        };
      }),
      format: 'JSONEachRow',
    });

    await clickhouse.insert({
      table: 'solana_transfers_raw',
      values: swaps.flatMap((s) => [
        {
          block_number: s.block.number,
          transaction_index: s.transaction.index,
          transaction_hash: s.transaction.id,

          account: s.account,
          token: s.input.mint,
          amount: denominate(-s.input.amount, s.input.mint).toString(),
          timestamp: toUnixTime(s.timestamp),
        },
        {
          block_number: s.block.number,
          transaction_index: s.transaction.index,
          transaction_hash: s.transaction.id,

          account: s.account,
          token: s.output.mint,
          amount: denominate(s.output.amount, s.output.mint).toString(),
          timestamp: toUnixTime(s.timestamp),
        },
      ]),
      format: 'JSONEachRow',
    });

    await ds.ack(swaps);

    const block = last(swaps).block;
    progress.track(block);
  }
}

void main();
