import path from 'node:path';
import * as process from 'node:process';
import { ClickhouseState } from '../../../core/states/clickhouse_state';
import { SolanaSwapsStream } from '../../../streams/solana_swaps/solana_swaps';
import { createClickhouseClient, ensureTables, toUnixTime } from '../../clickhouse';
import { createLogger } from '../../utils';
import { getSortFunction } from './util';

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
    portal: 'https://portal.sqd.dev/datasets/solana-beta',
    blockRange: {
      from: process.env.FROM_BLOCK || 317617480,
      to: process.env.TO_BLOCK,
    },
    args: {
      // type: ['orca_whirlpool'],
      tokens: TRACKED_TOKENS,
    },
    logger,
    state: new ClickhouseState(clickhouse, {
      table: 'solana_sync_status',
      id: 'dex_swaps',
      // onStateRollback: async (state, current) => {
      //   /**
      //    * Clean all data before the current offset.
      //    * There is a small chance if the stream is interrupted, the data will be duplicated.
      //    * We just clean it up at the start to avoid duplicates.
      //    */
      //
      //   await state.cleanAllBeforeOffset({
      //     table: 'solana_swaps_raw',
      //     column: 'block_number',
      //     offset: current.number,
      //   });
      // },
    }),
  });

  await ensureTables(clickhouse, path.join(__dirname, 'swaps.sql'));

  for await (const swaps of await ds.stream()) {
    await clickhouse.insert({
      table: 'solana_swaps_raw',
      values: swaps
        .filter((s) => s.input.amount > 0 && s.output.amount > 0)
        .map((s) => {
          /**
           * Sort tokens naturally to preserve the same pair order, i.e., ORCA/SOL and never SOL/ORCA.
           */
          const needTokenSwap = sortTokens(s.input.mint, s.output.mint);

          const tokenA = !needTokenSwap ? s.input : s.output;
          const tokenB = !needTokenSwap ? s.output : s.input;

          return {
            dex: s.type,
            block_number: s.block.number,
            transaction_hash: s.transaction.hash,
            transaction_index: s.transaction.index,
            instruction_address: s.instruction.address,
            account: s.account,
            token_a: tokenA.mint,
            token_b: tokenB.mint,
            a_to_b: !needTokenSwap,
            amount_a: (
              ((needTokenSwap ? 1 : -1) * Number(tokenA.amount)) /
              10 ** tokenA.decimals
            ).toString(),
            amount_b: (
              ((needTokenSwap ? -1 : 1) * Number(tokenB.amount)) /
              10 ** tokenB.decimals
            ).toString(),
            timestamp: toUnixTime(s.timestamp),
            sign: 1,
          };
        }),
      format: 'JSONEachRow',
    });

    await ds.ack();
  }
}

void main();
