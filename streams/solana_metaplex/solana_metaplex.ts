import { getInstructionData } from '@subsquid/solana-stream';
import { toHex } from '@subsquid/util-internal-hex';
import { BlockRef, PortalAbstractStream, TransactionRef } from '../../core/portal_abstract_stream';
import { Instruction, getTransactionHash } from '../solana_swaps/utils';
import * as metaplex from './abi/metaplex/index';

export type SolanaTokenMetadata = {
  account: string;
  mint: string;
  name: string;
  symbol: string;
  uri: string;
  isMutable: boolean;
  transaction: TransactionRef;
  block: BlockRef;
  timestamp: Date;
};

export function getInstructionD1(instruction: Instruction) {
  return toHex(getInstructionData(instruction)).slice(0, 4);
}

export class SolanaTokenMetadataStream extends PortalAbstractStream<SolanaTokenMetadata> {
  async stream(): Promise<ReadableStream<SolanaTokenMetadata[]>> {
    const source = await this.getStream({
      type: 'solana',
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
          programId: [metaplex.programId], // where executed by Whirlpool program
          d1: [
            metaplex.instructions.createMetadataAccount.d1,
            metaplex.instructions.createMetadataAccountV2.d1,
            metaplex.instructions.createMetadataAccountV3.d1,
            metaplex.instructions.updateMetadataAccount.d1,
            metaplex.instructions.updateMetadataAccountV2.d1,
          ],
          isCommitted: true, // where successfully committed
          innerInstructions: true, // inner instructions
          transaction: true, // transaction, that executed the given instruction
          transactionTokenBalances: true, // all token balance records of executed transaction
        },
      ],
    });

    return source.pipeThrough(
      new TransformStream({
        transform: ({ blocks }, controller) => {
          // FIXME
          const res = blocks.flatMap((block: any) => {
            if (!block.instructions) return [];

            const metadata: SolanaTokenMetadata[] = [];

            for (const ins of block.instructions) {
              if (ins.programId !== metaplex.programId) {
                continue;
              }

              const desc = getInstructionD1(ins);

              switch (desc) {
                case metaplex.instructions.createMetadataAccount.d1: {
                  const md = metaplex.instructions.createMetadataAccount.decode(ins);
                  return {
                    account: md.accounts.metadata,
                    mint: md.accounts.mint,
                    name: md.data.createMetadataAccountArgs.data.name,
                    symbol: md.data.createMetadataAccountArgs.data.symbol,
                    uri: md.data.createMetadataAccountArgs.data.uri,
                    isMutable: md.data.createMetadataAccountArgs.isMutable,
                    transaction: {
                      hash: getTransactionHash(ins, block),
                      index: ins.transactionIndex,
                    },
                    block: {
                      number: block.header.number,
                      hash: block.header.hash,
                      timestamp: block.header.timestamp,
                    },
                    timestamp: new Date(block.header.timestamp * 1000),
                  };
                }
                case metaplex.instructions.createMetadataAccountV2.d1: {
                  const md = metaplex.instructions.createMetadataAccountV2.decode(ins);
                  return {
                    account: md.accounts.metadata,
                    mint: md.accounts.mint,
                    name: md.data.createMetadataAccountArgsV2.data.name,
                    symbol: md.data.createMetadataAccountArgsV2.data.symbol,
                    uri: md.data.createMetadataAccountArgsV2.data.uri,
                    isMutable: md.data.createMetadataAccountArgsV2.isMutable,
                    transaction: {
                      hash: getTransactionHash(ins, block),
                      index: ins.transactionIndex,
                    },
                    block: {
                      number: block.header.number,
                      hash: block.header.hash,
                      timestamp: block.header.timestamp,
                    },
                    timestamp: new Date(block.header.timestamp * 1000),
                  };
                }
                case metaplex.instructions.createMetadataAccountV3.d1: {
                  const md = metaplex.instructions.createMetadataAccountV3.decode(ins);
                  return {
                    account: md.accounts.metadata,
                    mint: md.accounts.mint,
                    name: md.data.createMetadataAccountArgsV3.data.name,
                    symbol: md.data.createMetadataAccountArgsV3.data.symbol,
                    uri: md.data.createMetadataAccountArgsV3.data.uri,
                    isMutable: md.data.createMetadataAccountArgsV3.isMutable,
                    transaction: {
                      hash: getTransactionHash(ins, block),
                      index: ins.transactionIndex,
                    },
                    block: {
                      number: block.header.number,
                      hash: block.header.hash,
                      timestamp: block.header.timestamp,
                    },
                    timestamp: new Date(block.header.timestamp * 1000),
                  };
                }
              }
            }

            return metadata;
          });

          controller.enqueue(res);
        },
      }),
    );
  }
}
