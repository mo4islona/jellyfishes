import { AbstractStream } from '../../core/abstract_stream';
import * as raydium_amm from '../solana_swaps/abi/raydium_amm';
import * as meteora_damm from '../solana_swaps/abi/meteora_damm';
import {
  RaydiumAmmHandler,
  MeteoraAmmHandler,
  BaseHandler,
  LiquidityEvent,
  Protocol,
  InitializeLiquidity,
} from './handlers';
import { PoolRepository } from './repository/pool_repository';
import { getInstructionD1, Instruction } from '../solana_swaps/utils';
import { getInstructionDescriptor } from '@subsquid/solana-stream';

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
    dbPath?: string;
  },
  LiquidityEvent,
  { number: number; hash: string }
> {
  private handlerRegistry: Record<string, BaseHandler>;

  private poolRepository?: PoolRepository;

  initialize() {
    const { args } = this.options;

    // Initialize pool repository if dbPath is provided
    if (args.dbPath) {
      this.poolRepository = new PoolRepository(args.dbPath, this.logger);

      this.handlerRegistry = {
        [raydium_amm.programId]: new RaydiumAmmHandler(this.poolRepository),
        [meteora_damm.programId]: new MeteoraAmmHandler(this.poolRepository),
      };
    }
  }

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
          if (this.poolRepository) {
            this.savePoolMetadata(blocks);
          }

          blocks.flatMap((block: any) => {
            const offset = this.encodeOffset({
              number: block.header.number,
              hash: block.header.hash,
            });
            const liquidityEvents: LiquidityEvent[] = [];

            const { instructions } = block;
            if (!instructions) return;

            for (const instruction of block.instructions) {
              const handler = this.handlerRegistry[instruction.programId];
              if (!handler) continue;

              liquidityEvents.push(handler.handleInstruction(instruction, block, offset));
            }

            if (liquidityEvents.length) controller.enqueue(liquidityEvents);
          });
        },
      }),
    );
  }

  /**
   * Check if an instruction is an initialize pool instruction
   */
  private isInitializePoolInstruction(instruction: Instruction): boolean {
    // Check Raydium initialize instructions
    if (instruction.programId === raydium_amm.programId) {
      const d1 = getInstructionD1(instruction);
      return d1 === raydium_amm.instructions.initialize2.d1;
    }

    // Check Meteora initialize instructions
    if (instruction.programId === meteora_damm.programId) {
      const d8 = getInstructionDescriptor(instruction);
      return [
        meteora_damm.instructions.initializePermissionlessPoolWithFeeTier.d8,
        meteora_damm.instructions.initializePermissionedPool.d8,
        meteora_damm.instructions.initializePermissionlessPool.d8,
        meteora_damm.instructions.initializePermissionlessPoolWithFeeTier.d8,
        meteora_damm.instructions.initializePermissionlessConstantProductPoolWithConfig.d8,
        meteora_damm.instructions.initializePermissionlessConstantProductPoolWithConfig2.d8,
        meteora_damm.instructions.initializeCustomizablePermissionlessConstantProductPool.d8,
      ].includes(d8);
    }

    return false;
  }

  /**
   * Save pool metadata to SQLite database
   */
  private savePoolMetadata(blocks: any[]) {
    if (!this.poolRepository) return;

    try {
      // Begin transaction for better performance
      this.poolRepository.beginTransaction();

      // Process each block
      for (const block of blocks) {
        const { instructions } = block;
        if (!instructions) continue;

        // Find initialize events
        for (const instruction of instructions) {
          const handler = this.handlerRegistry[instruction.programId];
          if (!handler) continue;

          // Only process initialize events
          if (this.isInitializePoolInstruction(instruction)) {
            const event = handler.handleInitializePool(instruction, block, '');

            // Only process initialize events and ensure it's an InitializeLiquidity event
            if (event.eventType === 'initialize' && 'tokenAMint' in event) {
              const initEvent = event as InitializeLiquidity;
              const protocolValue = initEvent.protocol === 'raydium' ? 1 : 2;
              const poolTypeValue = initEvent.poolType === 'amm' ? 1 : 2;

              this.poolRepository.savePool({
                lp_mint: initEvent.lpMint,
                token_a: initEvent.tokenA,
                token_b: initEvent.tokenB,
                protocol: protocolValue,
                pool_type: poolTypeValue,
                block_number: block.header.number,
              });
            }
          }
        }
      }

      // Commit transaction
      this.poolRepository.commitTransaction();
    } catch (error) {
      // Rollback on error
      if (this.poolRepository) {
        this.poolRepository.rollbackTransaction();
      }
      this.logger.error(`Error saving pool metadata: ${error}`);
    }
  }

  /**
   * Close database connection when no longer needed
   */
  closeDatabase() {
    if (this.poolRepository) {
      this.poolRepository.close();
    }
  }
}
