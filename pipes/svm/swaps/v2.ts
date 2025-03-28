import { run } from '@subsquid/batch-processor';
import { DataSourceBuilder } from '@subsquid/solana-stream';
import { TypeormDatabase } from '@subsquid/typeorm-store';
import * as meteora_damm from '../../../streams/solana_swaps/abi/meteora_damm/index';
import * as meteora_dlmm from '../../../streams/solana_swaps/abi/meteora_dlmm/index';
import * as whirlpool from '../../../streams/solana_swaps/abi/orca_whirlpool/index';
import * as raydium_amm from '../../../streams/solana_swaps/abi/raydium_amm/index';
import * as raydium_clmm from '../../../streams/solana_swaps/abi/raydium_clmm/index';

const dataSource = new DataSourceBuilder()
  // Provide SQD Network Gateway URL.
  .setGateway('https://v2.archive.subsquid.io/network/solana-mainnet')
  .setBlockRange({ from: 290_000_000 })
  .setFields({
    block: {
      timestamp: true,
    },
    transaction: {
      signatures: true,
    },
    instruction: {
      programId: true,
      accounts: true,
      data: true,
    },
    tokenBalance: {
      preAmount: true,
      postAmount: true,
      preOwner: true,
      postOwner: true,
    },
  })
  .addInstruction({
    where: {
      programId: [whirlpool.programId],
      d8: [whirlpool.instructions.swap.d8],
      isCommitted: true,
    },
    include: {
      innerInstructions: true,
      transaction: true,
      transactionTokenBalances: true,
    },
  })
  .addInstruction({
    where: {
      programId: [meteora_damm.programId],
      d8: [meteora_damm.instructions.swap.d8],
      isCommitted: true,
    },
    include: {
      innerInstructions: true,
      transaction: true,
      transactionTokenBalances: true,
    },
  })
  .addInstruction({
    where: {
      programId: [meteora_dlmm.programId],
      d8: [meteora_dlmm.instructions.swap.d8, meteora_dlmm.instructions.swapExactOut.d8],
      isCommitted: true,
    },
    include: {
      innerInstructions: true,
      transaction: true,
      transactionTokenBalances: true,
    },
  })
  .addInstruction({
    where: {
      programId: [raydium_clmm.programId],
      d8: [
        raydium_clmm.instructions.swap.d8,
        raydium_clmm.instructions.swapV2.d8,
        raydium_clmm.instructions.swapRouterBaseIn.d8,
      ],
      isCommitted: true,
    },
    include: {
      innerInstructions: true,
      transaction: true,
      transactionTokenBalances: true,
    },
  })
  .addInstruction({
    where: {
      programId: [raydium_amm.programId],
      d1: [raydium_amm.instructions.swapBaseIn.d1, raydium_amm.instructions.swapBaseOut.d1],
      isCommitted: true,
    },
    include: {
      innerInstructions: true,
      transaction: true,
      transactionTokenBalances: true,
    },
  })
  .build();

process.env.DB_URL = 'postgresql://postgres:postgres@localhost:6432/postgres';

const database = new TypeormDatabase({});

run(dataSource, database, async (ctx) => {
  // data transformation and persistence code here
});
