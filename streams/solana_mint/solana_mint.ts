import { getInstructionData } from '@subsquid/solana-stream';
import { toHex } from '@subsquid/util-internal-hex';
import { AbstractStream, BlockRef, TransactionRef } from '../../core/abstract_stream';
import { getTransactionHash } from '../solana_swaps/utils';
import * as tokenProgram from './abi/tokenProgram/index';

export type SolanaMint = {
  account: string;
  version: 1 | 2;
  decimals: number;
  mintAuthority: string;
  freezeAuthority?: string;
  transaction: TransactionRef;
  block: BlockRef;
  timestamp: Date;
};

export class SolanaMintStream extends AbstractStream<
  {
    fromBlock: number;
    toBlock?: number;
  },
  SolanaMint
> {
  async stream(): Promise<ReadableStream<SolanaMint[]>> {
    const {args} = this.options;

    const source = await this.getStream({
      type: 'solana',
      fromBlock: args.fromBlock,
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
          programId: [tokenProgram.programId], // where executed by Whirlpool program
          d1: [
            tokenProgram.instructions.initializeMint.d1,
            tokenProgram.instructions.initializeMint2.d1,
          ], // have first 8 bytes of .data equal to swap descriptor
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

            const mints: SolanaMint[] = [];

            for (const ins of block.instructions) {
              if (ins.programId !== tokenProgram.programId) {
                continue;
              }

              const desc = toHex(getInstructionData(ins)).slice(0, 4);
              if (
                desc !== tokenProgram.instructions.initializeMint.d1 &&
                desc !== tokenProgram.instructions.initializeMint2.d1
              ) {
                continue;
              }

              const v1 = desc === tokenProgram.instructions.initializeMint.d1;
              const mint = v1
                ? tokenProgram.instructions.initializeMint.decode(ins)
                : tokenProgram.instructions.initializeMint2.decode(ins);

              const txHash = getTransactionHash(ins, block);

              mints.push({
                account: mint.accounts.mint,
                version: v1 ? 1 : 2,
                decimals: mint.data.decimals,
                mintAuthority: mint.data.mintAuthority,
                freezeAuthority: mint.data.freezeAuthority,
                transaction: {
                  hash: txHash,
                  index: ins.transactionIndex,
                },
                block: {number: block.header.number, hash: block.header.hash},
                timestamp: new Date(block.header.timestamp * 1000),
              });
            }

            return mints;
          });

          if (!res.length) return;

          controller.enqueue(res);
        },
      }),
    );
  }
}
