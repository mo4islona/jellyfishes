import assert from 'assert';
import * as tokenProgram from './abi/tokenProgram';
// import * as clmm from './abi/clmm/index';
import { SolanaSwapTransfer } from './solana_swaps';
import {
  Block,
  Instruction,
  getInnerTransfersByLevel,
  getInstructionBalances,
  getTransactionHash,
} from './utils';

export function handleRadiumClmm(ins: Instruction, block: Block): SolanaSwapTransfer {
  // const swap = whirlpool.instructions.swap.decode(ins);
  const [src, dest] = getInnerTransfersByLevel(ins, block.instructions, 1).map((t) =>
    tokenProgram.instructions.transfer.decode(t),
  );

  const tokenBalances = getInstructionBalances(ins, block);
  const inAcc = tokenBalances.find((b) => b.account === src.accounts.destination);
  const inputMint = inAcc?.preMint || inAcc?.postMint;
  if (!inputMint) {
    throw new Error(
      `Radium CLMM inputMint can't be found for tx ${getTransactionHash(ins, block)}`,
    );
  }

  const outAcc = tokenBalances.find((b) => b.account === dest.accounts.source);
  const outputMint = outAcc?.preMint || outAcc?.postMint;
  if (!outputMint) {
    throw new Error(
      `Radium CLMM outputMint can't be found for tx ${getTransactionHash(ins, block)}`,
    );
  }

  // const [inputVault, outputVault] = swap.data.aToB
  //   ? [swap.accounts.tokenVaultA, swap.accounts.tokenVaultB]
  //   : [swap.accounts.tokenVaultB, swap.accounts.tokenVaultA];

  return {
    type: 'radium_clmm',
    account: src.accounts.authority,
    input: {
      amount: src.data.amount,
      mint: inputMint,
      // vault: inputVault,
    },
    output: {
      amount: dest.data.amount,
      mint: outputMint,
      // vault: outputVault,
    },
  };
}
