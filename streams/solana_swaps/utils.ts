import assert from 'assert';
import { getInstructionData } from '@subsquid/solana-stream';
import { toHex } from '@subsquid/util-internal-hex';
import * as tokenProgram from './abi/tokenProgram';

export type Instruction = any;
export type Block = any;

export function getInstructionBalances(ins: Instruction, block: Block) {
  return block.tokenBalances?.filter((t) => t.transactionIndex === ins.transactionIndex) || [];
}

export function getTransactionHash(ins: Instruction, block: Block) {
  const tx = block.transactions.find((t) => t.transactionIndex === ins.transactionIndex);
  assert(tx, 'transaction not found');

  return tx.signatures[0];
}

export function getInnerTransfersByLevel(
  parent: Instruction,
  instructions: Instruction[],
  level: number,
) {
  return instructions.filter((inner) => {
    if (inner.transactionIndex !== parent.transactionIndex) return false;
    if (inner.instructionAddress.length !== parent.instructionAddress.length + level) return false;
    if (inner.programId !== tokenProgram.programId) return false;
    if (getInstructionD1(inner) !== tokenProgram.instructions.transfer.d1) return false;

    // All child instructions should have the same prefix as the parent
    return parent.instructionAddress.every((v, i) => v === inner.instructionAddress[i]);
  });
}

export function getNextInstruction(instruction: Instruction, instructions: Instruction[]) {
  const index = instructions.findIndex(
    (i) => i.instructionAddress === instruction.instructionAddress,
  );
  return instructions[index + 1];
}

export function getInstructionD1(instruction: Instruction) {
  return toHex(getInstructionData(instruction)).slice(0, 4);
}
