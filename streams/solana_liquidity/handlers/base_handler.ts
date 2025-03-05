import { Offset } from '../../../core/abstract_stream';
import { Instruction, Block } from '../../solana_swaps/utils';

export type Protocol = 'meteora' | 'raydium';
export type PoolType = 'amm' | 'clmm';
export type EventType = 'add' | 'remove' | 'initialize';

export interface BaseLiquidityEvent {
  lpMint: string;
  protocol: Protocol;
  poolType: PoolType;
  eventType: EventType;
  blockNumber: number;
  tokenAAmount: bigint;
  tokenBAmount: bigint;
  timestamp: Date;
  transactionHash: string;
  transactionIndex: number;
  offset: string;
  instruction: number[];
  sender: string;
}

export interface AddLiquidity extends BaseLiquidityEvent {}
export interface RemoveLiquidity extends BaseLiquidityEvent {}
export interface InitializeLiquidity extends BaseLiquidityEvent {
  tokenAMint: string;
  tokenBMint: string;
  tokenAReservesAccount: string;
  tokenBReservesAccount: string;
  initTimestamp: bigint;
}

export type LiquidityEvent = AddLiquidity | RemoveLiquidity | InitializeLiquidity;

export abstract class BaseHandler {
  constructor(
    public readonly protocol: Protocol,
    public readonly poolType: PoolType,
  ) {}

  abstract handleInstruction(
    instruction: Instruction,
    block: Block,
    offset: Offset,
  ): BaseLiquidityEvent;

  abstract handleInitializePool(
    instruction: Instruction,
    block: Block,
    offset: Offset,
  ): InitializeLiquidity;

  abstract handleAddLiquidity(instruction: Instruction, block: Block, offset: Offset): AddLiquidity;

  abstract handleRemoveLiquidity(
    instruction: Instruction,
    block: Block,
    offset: Offset,
  ): RemoveLiquidity;
}
