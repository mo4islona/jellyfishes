import { getInstructionData, getInstructionDescriptor } from '@subsquid/solana-stream';
import { toHex } from '@subsquid/util-internal-hex';
import { AbstractStream, BlockRef } from '../../core/abstract_stream';
import * as meteora_damm from './abi/meteora_damm/index';
import * as meteora_dlmm from './abi/meteora_dlmm/index';
import * as whirlpool from './abi/orca_whirlpool/index';
import * as raydium_amm from './abi/raydium_amm/index';
import * as raydium_clmm from './abi/raydium_clmm/index';
import { handleMeteoraDamm, handleMeteoraDlmm } from './handle_meteora';
import { handleWhirlpool } from './handle_orca';
import { handleRaydiumAmm, handleRaydiumClmm } from './handle_raydium';
import { getTransactionHash, Instruction } from './utils';

export type SwapType =
  | 'orca_whirlpool'
  | 'meteora_damm'
  | 'meteora_dlmm'
  | 'raydium_clmm'
  | 'raydium_amm';

export type SolanaSwap = {
  id: string;
  type: SwapType;
  account: string;
  transaction: { hash: string; index: number };
  input: {
    amount: bigint;
    mint: string;
    //vault: string };
  };
  output: {
    amount: bigint;
    mint: string;
    // vault: string
  };
  instruction: { address: number[] };
  block: BlockRef;
  timestamp: Date;
};

export type SolanaSwapTransfer = Pick<SolanaSwap, 'input' | 'output' | 'account' | 'type'>;

export function getInstructionD1(instruction: Instruction) {
  return toHex(getInstructionData(instruction)).slice(0, 4);
}

export class SolanaSwapsStream extends AbstractStream<
  {
    fromBlock: number;
    toBlock?: number;
    tokens?: string[];
    type?: SwapType[];
  },
  SolanaSwap
> {
  async stream(): Promise<ReadableStream<SolanaSwap[]>> {
    const {args} = this.options;

    const types = args.type || [
      'orca_whirlpool',
      'meteora_damm',
      'meteora_dlmm',
      'raydium_clmm',
      'raydium_amm',
    ];

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
      instructions: types.map((type) => {
        switch (type) {
          case 'orca_whirlpool':
            return {
              programId: [whirlpool.programId], // where executed by Whirlpool program
              d8: [whirlpool.instructions.swap.d8],
              isCommitted: true,
              innerInstructions: true,
              transaction: true,
              transactionTokenBalances: true,
            };
          case 'meteora_damm':
            return {
              programId: [meteora_damm.programId],
              d8: [meteora_damm.instructions.swap.d8],
              isCommitted: true,
              innerInstructions: true,
              transaction: true,
              transactionTokenBalances: true,
            };
          case 'meteora_dlmm':
            return {
              programId: [meteora_dlmm.programId],
              d8: [meteora_dlmm.instructions.swap.d8, meteora_dlmm.instructions.swapExactOut.d8],
              isCommitted: true,
              innerInstructions: true,
              transaction: true,
              transactionTokenBalances: true,
            };
          case 'raydium_clmm':
            return {
              programId: [raydium_clmm.programId],
              d8: [
                raydium_clmm.instructions.swap.d8,
                raydium_clmm.instructions.swapV2.d8,
                raydium_clmm.instructions.swapRouterBaseIn.d8,
              ],
              isCommitted: true,
              innerInstructions: true,
              transaction: true,
              transactionTokenBalances: true,
            };
          case 'raydium_amm':
            return {
              programId: [raydium_amm.programId],
              d1: [raydium_amm.instructions.swapBaseIn.d1, raydium_amm.instructions.swapBaseOut.d1],
              isCommitted: true,
              innerInstructions: true,
              transaction: true,
              transactionTokenBalances: true,
            };
        }
      }),
    });

    return source.pipeThrough(
      new TransformStream({
        transform: ({blocks}, controller) => {
          // FIXME
          const res = blocks.flatMap((block: any) => {
            if (!block.instructions) return [];

            const swaps: SolanaSwap[] = [];

            for (const ins of block.instructions) {
              let swap: SolanaSwapTransfer | null = null;

              switch (ins.programId) {
                case whirlpool.programId:
                  if (whirlpool.instructions.swap.d8 === getInstructionDescriptor(ins)) {
                    swap = handleWhirlpool(ins, block);
                    break;
                  }
                  break;
                case meteora_damm.programId:
                  switch (getInstructionDescriptor(ins)) {
                    case meteora_damm.instructions.swap.d8:
                      swap = handleMeteoraDamm(this.logger, ins, block);
                      break;
                  }
                  break;
                case meteora_dlmm.programId:
                  switch (getInstructionDescriptor(ins)) {
                    case meteora_dlmm.instructions.swap.d8:
                    case meteora_dlmm.instructions.swapExactOut.d8:
                      swap = handleMeteoraDlmm(ins, block);
                      break;
                  }
                  break;
                case raydium_amm.programId:
                  switch (getInstructionD1(ins)) {
                    case raydium_amm.instructions.swapBaseIn.d1:
                    case raydium_amm.instructions.swapBaseOut.d1:
                      swap = handleRaydiumAmm(ins, block);
                      break;
                  }
                  break;
                case raydium_clmm.programId:
                  switch (getInstructionD1(ins)) {
                    case raydium_clmm.instructions.swap.d8:
                    case raydium_clmm.instructions.swapV2.d8:
                    case raydium_clmm.instructions.swapRouterBaseIn.d8:
                      swap = handleRaydiumClmm(ins, block);
                      break;
                  }
                  break;
              }

              if (!swap) continue;
              else if (
                args.tokens &&
                !args.tokens.includes(swap.input.mint) &&
                !args.tokens.includes(swap.output.mint)
              ) {
                continue;
              }

              const txHash = getTransactionHash(ins, block);

              swaps.push({
                id: `${txHash}/${ins.transactionIndex}`,
                type: swap.type,
                block: {number: block.header.number, hash: block.header.hash},
                instruction: {
                  address: ins.instructionAddress,
                },
                input: swap.input,
                output: swap.output,
                account: swap.account,
                transaction: {
                  hash: txHash,
                  index: ins.transactionIndex,
                },
                timestamp: new Date(block.header.timestamp * 1000),
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
