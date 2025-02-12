import assert from 'assert';
import { getInstructionDescriptor } from '@subsquid/solana-stream';
import { AbstractStream, BlockRef } from '../../core/abstract_stream';
import * as damm from './abi/damm/index';
import * as dlmm from './abi/dlmm/index';
import * as tokenProgram from './abi/tokenProgram/index';
import * as whirlpool from './abi/whirlpool/index';

export type SolanaSwap = {
  id: string;
  dex: 'orca' | 'meteora';
  program: 'whirlpool' | 'damm' | 'dlmm';
  account: string;
  transaction: { hash: string; index: number };
  input: { amount: bigint; mint: string; vault: string };
  output: { amount: bigint; mint: string; vault: string };
  instruction: { address: number[] };
  block: BlockRef;
  offset: string;
  timestamp: Date;
};

export function extractInnerInstructions(instruction: any, instructions: any[]) {
  return instructions.filter(
    (i) =>
      i.transactionIndex === instruction.transactionIndex &&
      i.instructionAddress.length === instruction.instructionAddress.length + 1 &&
      instruction.instructionAddress.every((a, j) => a === i.instructionAddress[j]),
  );
}

function decodeTokenTransfers(instruction: any, instructions: any[]) {
  const transfers = instructions.filter(
    (i) =>
      i.transactionIndex === instruction.transactionIndex &&
      i.instructionAddress.length === instruction.instructionAddress.length + 1 &&
      instruction.instructionAddress.every((a, j) => a === i.instructionAddress[j]),
  );

  return transfers.map((i) => tokenProgram.instructions.transfer.decode(i));
}

function getTransactionHash(ins: any, block: any) {
  const tx = block.transactions.find((t) => t.transactionIndex === ins.transactionIndex);
  assert(tx, 'transaction not found');

  return tx.signatures[0];
}

export type Dex = 'orca' | 'meteora_damm' | 'meteora_dlmm';

export class SolanaSwapsStream extends AbstractStream<
  {
    fromBlock: number;
    toBlock?: number;
    tokens?: string[];
    dex?: Dex[];
  },
  SolanaSwap,
  { number: number; hash: string }
> {
  async stream(): Promise<ReadableStream<SolanaSwap[]>> {
    const {args} = this.options;

    const offset = await this.getState({number: args.fromBlock, hash: ''});

    this.logger.debug(`starting from block ${offset.number}`);

    const dexes = args.dex || [
      'orca',
      // 'meteora_damm',
      // 'meteora_dlmm'
    ];

    const source = this.portal.getFinalizedStream({
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
      instructions: dexes.map((dex) => {
        switch (dex) {
          case 'orca':
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
              programId: [damm.programId],
              d8: [damm.instructions.swap.d8],
              isCommitted: true,
              innerInstructions: true,
              transaction: true,
              transactionTokenBalances: true,
            };
          case 'meteora_dlmm':
            return {
              programId: [dlmm.programId],
              d8: [dlmm.instructions.swap.d8],
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

            const offset = this.encodeOffset({
              number: block.header.number,
              hash: block.header.hash,
            });

            for (const ins of block.instructions) {
              if (
                ins.programId === whirlpool.programId &&
                getInstructionDescriptor(ins) === whirlpool.instructions.swap.d8
              ) {
                const tokenBalances =
                  block.tokenBalances?.filter((t) => t.transactionIndex === ins.transactionIndex) ||
                  [];

                const swap = whirlpool.instructions.swap.decode(ins);
                const [src, dest] = decodeTokenTransfers(ins, block.instructions);

                const inputMint = tokenBalances.find(
                  (balance) => balance.account === src.accounts.destination,
                )?.preMint;
                assert(inputMint != null, 'inputMint is null');
                const inputAmount = src.data.amount;

                const outputMint = tokenBalances.find(
                  (balance) => balance.account === dest.accounts.source,
                )?.preMint;
                assert(outputMint != null, 'outputMint is null');
                const outputAmount = dest.data.amount;

                if (
                  args.tokens &&
                  !args.tokens.includes(inputMint) &&
                  !args.tokens.includes(outputMint)
                ) {
                  continue;
                }

                const txHash = getTransactionHash(ins, block);

                const [inputVault, outputVault] = swap.data.aToB
                  ? [swap.accounts.tokenVaultA, swap.accounts.tokenVaultB]
                  : [swap.accounts.tokenVaultB, swap.accounts.tokenVaultA];

                swaps.push({
                  id: `${txHash}/${ins.transactionIndex}`,
                  dex: 'orca',
                  program: 'whirlpool',
                  block: {number: block.header.number, hash: block.header.hash},
                  instruction: {
                    address: ins.instructionAddress,
                  },
                  account: src.accounts.authority,
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
                    hash: txHash,
                    index: ins.transactionIndex,
                  },
                  timestamp: new Date(block.header.timestamp * 1000),
                  offset,
                });
              } else if (
                ins.programId === damm.programId &&
                getInstructionDescriptor(ins) === damm.instructions.swap.d8
              ) {
                //   const swap = damm.instructions.swap.decode(ins);
                //   if (
                //     args.tokens &&
                //     !args.tokens.includes(swap.accounts.) &&
                //     !args.tokens.includes(swap.tokenY)
                //   ) {
                //     continue;
                //   }
                //
                //   const {
                //     pool: poolAddress,
                //     tokenAMint,
                //     tokenBMint,
                //     aTokenVault,
                //     bTokenVault,
                //     aVaultLpMint,
                //     bVaultLpMint
                //   } = accounts
                //
                //   const transfers = decodeTokenTransfers(ins, block.instructions);
                //   let depositX = 0n,
                //     withdrawX = 0n;
                //   let depositY = 0n,
                //     withdrawY = 0n;
                //   let isXtoY = false;
                //
                //   for (const t of transfers) {
                //     if (t.accounts.destination === swap.tokenXVault) {
                //       depositX += t.data.amount;
                //       isXtoY = true;
                //     }
                //     if (t.accounts.source === swap.tokenXVault) {
                //       withdrawX += t.data.amount;
                //       isXtoY = false;
                //     }
                //     if (t.accounts.destination === swap.tokenYVault) {
                //       depositY += t.data.amount;
                //       isXtoY = false;
                //     }
                //     if (t.accounts.source === swap.tokenYVault) {
                //       withdrawY += t.data.amount;
                //       isXtoY = true;
                //     }
                //   }
                //   const netFlowX = depositX - withdrawX;
                //   const netFlowY = depositY - withdrawY;
                //
                //   let amountIn = 0n;
                //   let amountOut = 0n;
                //   let inMint = '';
                //   let inVault = '';
                //   let outMint = '';
                //   let outVault = '';
                //
                //   // X→Y:
                //   if (isXtoY) {
                //     amountIn = netFlowX;
                //     amountOut = -netFlowY;
                //     inMint = swap.tokenX;
                //     inVault = swap.tokenXVault;
                //     outMint = swap.tokenY;
                //     outVault = swap.tokenYVault;
                //   }
                //   // Y→X:
                //   else {
                //     amountIn = netFlowY;
                //     amountOut = -netFlowX;
                //     inMint = swap.tokenY;
                //     inVault = swap.tokenYVault;
                //     outMint = swap.tokenX;
                //     outVault = swap.tokenXVault;
                //   }
                //
                //   const txHash = getTransactionHash(ins, block);
                //
                //   swaps.push({
                //     id: `${txHash}/${ins.transactionIndex}`,
                //     dex: 'orca',
                //     program: 'whirlpool',
                //     block: {number: block.header.number, hash: block.header.hash},
                //     instruction: {
                //       address: ins.instructionAddress,
                //     },
                //     account: transfers[0].accounts.authority,
                //     input: {
                //       amount: amountIn,
                //       mint: inMint,
                //       vault: inVault,
                //     },
                //     output: {
                //       amount: amountOut,
                //       mint: outMint,
                //       vault: outVault,
                //     },
                //     transaction: {
                //       hash: txHash,
                //       index: ins.transactionIndex,
                //     },
                //     timestamp: new Date(block.header.timestamp * 1000),
                //     offset,
                //   });
              }
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
