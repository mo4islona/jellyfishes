import assert from 'assert';
import { getInstructionDescriptor } from '@subsquid/solana-stream';
import { AbstractStream, BlockRef } from '../../core/abstract_stream';
import * as tokenProgram from './abi/tokenProgram/index';
import * as whirlpool from './abi/whirlpool/index';

export type SolanaSwap = {
  id: string;
  account: string;
  transaction: { id: string; index: number };
  input: { amount: bigint; mint: string; vault: string };
  output: { amount: bigint; mint: string; vault: string };
  instruction: { address: number[] };
  block: BlockRef;
  offset: string;
  timestamp: Date;
};

function extractInnerInstructions(instruction: any, instructions: any[]) {
  return instructions.filter(
    (i) =>
      i.transactionIndex === instruction.transactionIndex &&
      i.instructionAddress.length === instruction.instructionAddress.length + 1 &&
      instruction.instructionAddress.every((a, j) => a === i.instructionAddress[j]),
  );
}

export class SolanaWhirlpoolStream extends AbstractStream<
  {
    args: {
      fromBlock: number;
      toBlock?: number;
      tokens?: string[];
    };
  },
  SolanaSwap
> {
  async stream(): Promise<ReadableStream<SolanaSwap[]>> {
    const {args} = this.options;

    const offset = await this.getOffset({number: args.fromBlock, hash: ''});

    this.logger.debug(`starting from block ${offset.number}`);

    const source = this.options.portal.getFinalizedStream({
      type: 'solana',
      fromBlock: offset.number,
      toBlock: args.toBlock,
      fields: {
        block: {
          number: true,
          hash: true,
          timestamp: true,
        },
        transaction: {
          transactionIndex: true,
          signatures: true,
        },
        instruction: {
          transactionIndex: true,
          data: true,
          instructionAddress: true,
          programId: true,
          accounts: true,
        },
        tokenBalance: {
          transactionIndex: true,
          account: true,
          preMint: true,
          postMint: true,
        },
      },
      instructions: [
        {
          programId: [whirlpool.programId], // where executed by Whirlpool program
          d8: [whirlpool.instructions.swap.d8], // have first 8 bytes of .data equal to swap descriptor

          isCommitted: true, // where successfully committed
          innerInstructions: true, // inner instructions
          transaction: true, // transaction, that executed the given instruction
          transactionTokenBalances: true, // all token balance records of executed transaction
        },
      ],
    });

    return source.pipeThrough(
      new TransformStream({
        transform: ({blocks}, controller) => {
          // FIXME
          const res = blocks.flatMap((block: any) => {
            if (!block.instructions) return [];

            const swaps: SolanaSwap[] = [];

            const offset = this.encodeOffset({
              number: block.header.number,
              hash: block.header.hash,
            });

            for (const ins of block.instructions) {
              if (ins.programId !== whirlpool.programId) {
                continue;
              } else if (getInstructionDescriptor(ins) !== whirlpool.instructions.swap.d8) {
                continue;
              }

              const tokenBalances =
                block.tokenBalances?.filter((t) => t.transactionIndex === ins.transactionIndex) ||
                [];

              const swap = whirlpool.instructions.swap.decode(ins);

              const [src, dest] = extractInnerInstructions(ins, block.instructions);
              const srcTransfer = tokenProgram.instructions.transfer.decode(src);
              const destTransfer = tokenProgram.instructions.transfer.decode(dest);

              const inputMint = tokenBalances.find(
                (balance) => balance.account === srcTransfer.accounts.destination,
              )?.preMint;
              assert(inputMint != null, 'inputMint is null');
              const inputAmount = srcTransfer.data.amount;

              const outputMint = tokenBalances.find(
                (balance) => balance.account === destTransfer.accounts.source,
              )?.preMint;
              assert(outputMint != null, 'outputMint is null');
              const outputAmount = destTransfer.data.amount;

              if (
                args.tokens &&
                !args.tokens.includes(inputMint) &&
                !args.tokens.includes(outputMint)
              ) {
                continue;
              }

              const tx = block.transactions.find(
                (t) => t.transactionIndex === ins.transactionIndex,
              );
              const txId = tx.signatures[0];
              assert(tx, 'transaction not found');

              const [inputVault, outputVault] = swap.data.aToB
                ? [swap.accounts.tokenVaultA, swap.accounts.tokenVaultB]
                : [swap.accounts.tokenVaultB, swap.accounts.tokenVaultA];

              swaps.push({
                id: `${txId}/${ins.transactionIndex}`,
                block: {number: block.header.number, hash: block.header.hash},
                instruction: {
                  address: ins.instructionAddress,
                },
                account: srcTransfer.accounts.authority,
                input: {
                  amount: inputAmount,
                  mint: inputMint,
                  vault: inputVault,
                },
                output: {
                  amount: outputAmount,
                  mint: outputMint,
                  vault: outputVault,
                },
                transaction: {
                  id: txId,
                  index: ins.transactionIndex,
                },
                timestamp: new Date(block.header.timestamp * 1000),
                offset,
              });
            }

            return swaps;
          });

          if (!res.length) return;

          controller.enqueue(res);
        },
      }),
    );
  }
}
