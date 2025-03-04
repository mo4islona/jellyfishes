// import path from 'node:path';
// import { ClickhouseState } from '../../core/states/clickhouse_state';
// import { createLogger, formatNumber } from '../../examples/utils';
// import {
//   cleanAllBeforeOffset,
//   createClickhouseClient,
//   ensureTables,
//   toUnixTime,
// } from '../../solana_dexes/clickhouse';
// import { getSortFunction } from '../../solana_dexes/swaps/util';
// import { FACTORY_DEPLOYED_AT, UniswapStream } from '../../streams/uniswap/uniswap_stream';
//
// function denominate(amount: bigint) {
//   return Number(amount) / 10 ** 18;
// }
//
// const TRACKED_TOKENS = [
//   'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
//   'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
//   'So11111111111111111111111111111111111111112', // SOL
// ];
//
// const sortTokens = getSortFunction(TRACKED_TOKENS);
//
// async function main() {
//   const clickhouse = createClickhouseClient();
//   const logger = createLogger('solana_swaps');
//
//   const ds = new UniswapStream({
//     portal: 'https://portal.sqd.dev/datasets/ethereum-mainnet',
//     args: {
//       fromBlock: FACTORY_DEPLOYED_AT,
//     },
//     logger,
//     state: new ClickhouseState(clickhouse, {
//       table: 'evm_sync_status',
//       id: 'uniswap_swaps',
//     }),
//     onStart: async ({current, initial}) => {
//       /**
//        * Clean all data before the current offset.
//        * There is a small chance if the stream is interrupted, the data will be duplicated.
//        * We just clean it up at the start to avoid duplicates.
//        */
//       await cleanAllBeforeOffset(
//         {clickhouse, logger},
//         {table: 'uniswap_v3_swaps_raw', column: 'block_number', offset: current.number},
//       );
//
//       if (initial.number === current.number) {
//         logger.info(`Syncing from ${formatNumber(current.number)}`);
//         return;
//       }
//
//       logger.info(`Resuming from ${formatNumber(current.number)}`);
//     },
//     onProgress: ({state, interval}) => {
//       logger.info({
//         message: `${formatNumber(state.current)} / ${formatNumber(state.last)} (${formatNumber(state.percent)}%)`,
//         speed: `${interval.processedPerSecond} blocks/second`,
//       });
//     },
//   });
//
//   await ensureTables(clickhouse, path.join(__dirname, 'swaps.sql'));
//
//   for await (const swaps of await ds.stream()) {
//     await clickhouse.insert({
//       table: 'uniswap_v3_swaps_raw',
//       values: swaps
//         .filter((s) => s.amount0 > 0 && s.amount1 > 0)
//         .map((s) => {
//           /**
//            * Sort tokens naturally to preserve the same pair order, i.e., ORCA/SOL and never SOL/ORCA.
//            */
//           // const needTokenSwap = sortTokens(s..mint, s.output.mint);
//           //
//           // const tokenA = !needTokenSwap ? s.input : s.output;
//           // const tokenB = !needTokenSwap ? s.output : s.input;
//
//           return {
//             dex: 'uniswap_v3',
//             block_number: s.block.number,
//             transaction_hash: s.transaction.hash,
//             transaction_index: s.transaction.index,
//             account: s.sender,
//             token_a: s.contract_address,
//             token_b: s.recipient,
//             a_to_b: false, // !needTokenSwap,
//             amount_a: denominate(s.amount0).toString(),
//             amount_b: denominate(s.amount1).toString(),
//             timestamp: toUnixTime(s.timestamp),
//             sign: 1,
//           };
//         }),
//       format: 'JSONEachRow',
//     });
//
//     // await ds.ack(swaps);
//   }
// }
//
// void main();
