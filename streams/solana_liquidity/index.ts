import {
  PortalAbstractStream,
  OptionalArgs,
} from "../../core/portal_abstract_stream";
import * as raydium_amm from "../solana_swaps/abi/raydium_amm";
import * as meteora_damm from "../solana_swaps/abi/meteora_damm";
import * as whirlpool from "../solana_swaps/abi/orca_whirlpool";
import {
  RaydiumAmmHandler,
  MeteoraAmmHandler,
  OrcaWhirlpoolHandler,
  BaseHandler,
  LiquidityEvent,
  Protocol,
} from "./handlers";
import { PoolRepository } from "./repository/pool_repository";
import {
  addErrorContext,
  getInstructionD1,
  Instruction,
} from "../solana_swaps/utils";
import { augmentBlock } from "@subsquid/solana-objects";

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
      raydium_amm.instructions.swapBaseIn.d1,
      raydium_amm.instructions.swapBaseOut.d1,
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
      meteora_damm.instructions
        .initializePermissionlessConstantProductPoolWithConfig.d8,
      meteora_damm.instructions
        .initializePermissionlessConstantProductPoolWithConfig2.d8,
      meteora_damm.instructions
        .initializeCustomizablePermissionlessConstantProductPool.d8,
      meteora_damm.instructions.swap.d8,
    ],
    isCommitted: true,
    innerInstructions: true,
    transaction: true,
    transactionTokenBalances: true,
  },
  {
    programId: [whirlpool.programId],
    d8: [
      whirlpool.instructions.swap.d8,
      whirlpool.instructions.increaseLiquidity.d8,
      whirlpool.instructions.decreaseLiquidity.d8,
      whirlpool.instructions.initializePool.d8,
      whirlpool.instructions.initializePoolV2.d8,
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
    preAmount: true,
    postAmount: true,
    preDecimals: true,
    postDecimals: true,
  },
};

type SolanaLiquidityStreamArgs = OptionalArgs<{
  type: Protocol[];
}>;

export class SolanaLiquidityStream extends PortalAbstractStream<
  LiquidityEvent,
  SolanaLiquidityStreamArgs
> {
  private handlerRegistry: Record<string, BaseHandler>;
  private poolRepository?: PoolRepository;

  initialize() {
    this.handlerRegistry = {
      [raydium_amm.programId]: new RaydiumAmmHandler(),
      [meteora_damm.programId]: new MeteoraAmmHandler(),
      [whirlpool.programId]: new OrcaWhirlpoolHandler(),
    };
  }

  async stream(): Promise<ReadableStream<LiquidityEvent[]>> {
    const query = {
      type: "solana",
      fromBlock: this.options.blockRange.from,
      toBlock: this.options.blockRange.to,
      fields: ALL_FIELDS,
      instructions: instructionFilters,
    };
    const source = await this.getStream(query);

    return source.pipeThrough(
      new TransformStream({
        transform: ({ blocks }, controller) => {
          const liquidityEvents = blocks.flatMap((_block: any) => {
            const block = augmentBlock<typeof ALL_FIELDS>({
              header: _block.header,
              instructions: _block.instructions || [],
              logs: _block.logs || [],
              balances: _block.balances || [],
              tokenBalances: _block.tokenBalances || [],
              rewards: _block.rewards || [],
              transactions: _block.transactions || [],
            });

            const liquidityEvents: LiquidityEvent[] = [];

            const { instructions } = block;
            if (!instructions) return liquidityEvents;

            for (const instruction of block.instructions) {
              try {
                const handler = this.handlerRegistry[instruction.programId];
                if (!handler) continue;

                liquidityEvents.push(
                  handler.handleInstruction(instruction, block)
                );
              } catch (error: any) {
                throw addErrorContext(error, {
                  tx: instruction.transaction?.signatures.join(", "),
                  instruction: instruction.instructionAddress
                    .map((i) => i + 1)
                    .join("."),
                });
              }
            }

            return liquidityEvents;
          });

          controller.enqueue(liquidityEvents);
        },
      })
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
      switch (instruction.d8) {
        case meteora_damm.instructions.initializePermissionlessPoolWithFeeTier
          .d8:
        case meteora_damm.instructions.initializePermissionedPool.d8:
        case meteora_damm.instructions.initializePermissionlessPool.d8:
        case meteora_damm.instructions.initializePermissionlessPoolWithFeeTier
          .d8:
        case meteora_damm.instructions
          .initializePermissionlessConstantProductPoolWithConfig.d8:
        case meteora_damm.instructions
          .initializePermissionlessConstantProductPoolWithConfig2.d8:
        case meteora_damm.instructions
          .initializeCustomizablePermissionlessConstantProductPool.d8:
          return true;
        default:
          return false;
      }
    }

    return false;
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
