import { AbstractStream, BlockRef, TransactionRef } from '../../core/abstract_stream';
import { getTransactionHash } from '../solana_swaps/utils';
import * as pumpfun from './abi/pumpfun';
import { getInstructionDescriptor } from '@subsquid/solana-stream';

export type PumpfunToken = ReturnType<typeof pumpfun.instructions.create.decode> & {
  transaction: TransactionRef;
  block: BlockRef;
  timestamp: Date;
};

export class SolanaPumpfunTokensStream extends AbstractStream<
  {
    fromBlock: number;
    toBlock?: number;
  },
  PumpfunToken
> {
  async stream(): Promise<ReadableStream<PumpfunToken[]>> {
    const { args } = this.options;

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
      },
      instructions: [
        {
          programId: [pumpfun.programId], // where executed by Whirlpool program
          d8: [pumpfun.instructions.create.d8],
          isCommitted: true, // where successfully committed
          transaction: true, // transaction, that executed the given instruction
        },
      ],
    });

    return source.pipeThrough(
      new TransformStream({
        transform: ({ blocks }, controller) => {
          // FIXME
          const res = blocks.flatMap((block: any) => {
            if (!block.instructions) return [];

            const tokens: PumpfunToken[] = [];

            for (const ins of block.instructions) {
              if (
                ins.programId !== pumpfun.programId ||
                getInstructionDescriptor(ins) !== pumpfun.instructions.create.d8
              ) {
                continue;
              }

              const token = pumpfun.instructions.create.decode(ins);

              tokens.push({
                ...token,
                transaction: {
                  hash: getTransactionHash(ins, block),
                  index: ins.transactionIndex,
                },
                block: { number: block.header.number, hash: block.header.hash },
                timestamp: new Date(block.header.timestamp * 1000),
              });
            }

            return tokens;
          });

          if (!res.length) return;

          controller.enqueue(res);
        },
      }),
    );
  }
}
