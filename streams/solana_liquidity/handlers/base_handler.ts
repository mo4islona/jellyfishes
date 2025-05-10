import { Instruction, Block } from "../../solana_swaps/utils";

export type Protocol = "meteora" | "raydium" | "orca";
export type PoolType = "amm" | "clmm";
export type EventType = "add" | "remove" | "initialize" | "swap";

export interface BaseLiquidityEvent {
  pool: string;
  protocol: Protocol;
  poolType: PoolType;
  eventType: EventType;
  blockNumber: number;
  tokenAMint: string;
  tokenBMint: string;
  tokenAAmount: bigint;
  tokenBAmount: bigint;
  tokenADecimals: number;
  tokenBDecimals: number;
  tokenABalance: bigint;
  tokenBBalance: bigint;
  tokenAVault: string;
  tokenBVault: string;
  timestamp: Date;
  transactionHash: string;
  transactionIndex: number;
  instruction: number[];
  sender?: string;
}

export interface AddLiquidity extends BaseLiquidityEvent {}
export interface RemoveLiquidity extends BaseLiquidityEvent {}
export interface InitializeLiquidity extends BaseLiquidityEvent {}

export interface SwapLiquidityEvent extends BaseLiquidityEvent {}

export type LiquidityEvent =
  | AddLiquidity
  | RemoveLiquidity
  | InitializeLiquidity;

export abstract class BaseHandler {
  constructor(
    public readonly protocol: Protocol,
    public readonly poolType: PoolType // protected readonly poolRepository: PoolRepository,
  ) {}

  abstract handleInstruction(
    instruction: Instruction,
    block: Block
  ): BaseLiquidityEvent;

  abstract handleInitializePool(
    instruction: Instruction,
    block: Block
  ): InitializeLiquidity;

  abstract handleAddLiquidity(
    instruction: Instruction,
    block: Block
  ): AddLiquidity;

  abstract handleRemoveLiquidity(
    instruction: Instruction,
    block: Block
  ): RemoveLiquidity;
}
