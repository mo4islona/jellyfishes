import { AbstractStream } from '../../core/abstract_stream';
import * as raydium_amm from '../solana_swaps/abi/raydium_amm';
import * as meteora_damm from '../solana_swaps/abi/meteora_damm';
import {
  RaydiumAmmHandler,
  MeteoraAmmHandler,
  BaseHandler,
  LiquidityEvent,
  Protocol,
} from './handlers';

interface InstructionFilter {
  programId: string[];
  d1?: string[];
  d8?: string[];
  isCommitted: boolean;
  innerInstructions: boolean;
  transaction: boolean;
  transactionTokenBalances: boolean;
}

const instructionFilters: InstructionFilter[] = [
  {
    programId: [raydium_amm.programId],
    d1: [
      raydium_amm.instructions.deposit.d1,
      raydium_amm.instructions.withdraw.d1,
      raydium_amm.instructions.initialize2.d1,
    ],
    isCommitted: true,
    innerInstructions: true,
    transaction: true,
    transactionTokenBalances: true,
  },
  {
    programId: [meteora_damm.programId],
    d8: [
      meteora_damm.instructions.addBalanceLiquidity.d8,
      meteora_damm.instructions.addImbalanceLiquidity.d8,
      meteora_damm.instructions.removeBalanceLiquidity.d8,
      meteora_damm.instructions.removeLiquiditySingleSide.d8,
      meteora_damm.instructions.bootstrapLiquidity.d8,
      meteora_damm.instructions.initializePermissionlessPoolWithFeeTier.d8,
      meteora_damm.instructions.initializePermissionedPool.d8,
      meteora_damm.instructions.initializePermissionlessPool.d8,
      meteora_damm.instructions.initializePermissionlessPoolWithFeeTier.d8,
      meteora_damm.instructions.initializePermissionlessConstantProductPoolWithConfig.d8,
      meteora_damm.instructions.initializePermissionlessConstantProductPoolWithConfig2.d8,
      meteora_damm.instructions.initializeCustomizablePermissionlessConstantProductPool.d8,
    ],
    isCommitted: true,
    innerInstructions: true,
    transaction: true,
    transactionTokenBalances: true,
  },
];

const ALL_FIELDS = {
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
};

export class SolanaLiquidityStream extends AbstractStream<
  {
    fromBlock: number;
    toBlock?: number;
    type?: Protocol[];
  },
  LiquidityEvent,
  { number: number; hash: string }
> {
  private static readonly handlerRegistry: Record<string, BaseHandler> = {
    [raydium_amm.programId]: new RaydiumAmmHandler(),
    [meteora_damm.programId]: new MeteoraAmmHandler(),
  };

  async stream(): Promise<ReadableStream<LiquidityEvent[]>> {
    const { args } = this.options;
    const offset = await this.getState({ number: args.fromBlock, hash: '' });
    const source = this.portal.getFinalizedStream({
      type: 'solana',
      fromBlock: offset.number,
      toBlock: args.toBlock,
      fields: ALL_FIELDS,
      instructions: instructionFilters,
    });

    return source.pipeThrough(
      new TransformStream({
        transform: ({ blocks }, controller) => {
          blocks.flatMap((block: any) => {
            const offset = this.encodeOffset({
              number: block.header.number,
              hash: block.header.hash,
            });
            const liquidityEvents: LiquidityEvent[] = [];

            const { instructions } = block;
            if (!instructions) return;

            for (const instruction of block.instructions) {
              const handler = SolanaLiquidityStream.handlerRegistry[instruction.programId];
              if (!handler) continue;

              liquidityEvents.push(handler.handleInstruction(instruction, block, offset));
            }

            if (liquidityEvents.length) controller.enqueue(liquidityEvents);
          });
        },
      }),
    );
  }
}
