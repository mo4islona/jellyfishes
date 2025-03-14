import * as tokenProgram from './abi/tokenProgram';
// import * as whirlpool from './abi/whirlpool';
import { SolanaSwapTransfer } from './solana_swaps';
import { Block, getInnerTransfersByLevel, getInstructionBalances, Instruction } from './utils';

export function handleWhirlpool(ins: Instruction, block: Block): SolanaSwapTransfer {
  // const swap = whirlpool.instructions.swap.decode(ins);
  const [src, dest] = getInnerTransfersByLevel(ins, block.instructions, 1).map((t) =>
    tokenProgram.instructions.transfer.decode(t),
  );
  const tokenBalances = getInstructionBalances(ins, block);

  // const [inputVault, outputVault] = swap.data.aToB
  //   ? [swap.accounts.tokenVaultA, swap.accounts.tokenVaultB]
  //   : [swap.accounts.tokenVaultB, swap.accounts.tokenVaultA];

  return {
    type: 'orca_whirlpool',
    account: src.accounts.authority,
    in: {
      amount: src.data.amount,
      token: tokenBalances.find((b) => b.account === src.accounts.destination),
    },
    out: {
      amount: dest.data.amount,
      token: tokenBalances.find((b) => b.account === dest.accounts.source),
    },
  };
}
