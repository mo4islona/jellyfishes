import {
  Block,
  getInnerTransfersByLevel,
  getNextInstruction,
  getTransactionHash,
  Instruction,
} from '../../solana_swaps/utils';
import { Offset } from 'core/abstract_stream';
import { BaseHandler } from './base_handler';
import { AddLiquidity, RemoveLiquidity, InitializeLiquidity } from './base_handler';
import * as meteoraDamm from '../../solana_swaps/abi/meteora_damm';
import * as tokenProgram from '../../solana_swaps/abi/tokenProgram';
import * as systemProgram from '../../solana_swaps/abi/system';

import { getInstructionDescriptor } from '@subsquid/solana-stream';
import { PoolRepository } from '../repository/pool_repository';

export class MeteoraAmmHandler extends BaseHandler {
  constructor(poolRepository: PoolRepository) {
    super('meteora', 'amm', poolRepository);
  }

  handleInstruction(instruction: Instruction, block: Block, offset: Offset) {
    const descriptor = getInstructionDescriptor(instruction);
    switch (descriptor) {
      case meteoraDamm.instructions.addBalanceLiquidity.d8:
      case meteoraDamm.instructions.addImbalanceLiquidity.d8:
      case meteoraDamm.instructions.bootstrapLiquidity.d8:
        return this.handleAddLiquidity(instruction, block, offset);

      case meteoraDamm.instructions.removeBalanceLiquidity.d8:
        return this.handleRemoveLiquidity(instruction, block, offset);

      case meteoraDamm.instructions.removeLiquiditySingleSide.d8:
        return this.handleRemoveLiquiditySingleSide(instruction, block, offset);

      case meteoraDamm.instructions.initializePermissionlessPool.d8:
        return this.handleInitializePool(instruction, block, offset);

      case meteoraDamm.instructions.initializePermissionedPool.d8:
      case meteoraDamm.instructions.initializePermissionlessPool.d8:
      case meteoraDamm.instructions.initializePermissionlessPoolWithFeeTier.d8:
      case meteoraDamm.instructions.initializePermissionlessConstantProductPoolWithConfig.d8:
      case meteoraDamm.instructions.initializePermissionlessConstantProductPoolWithConfig2.d8:
      case meteoraDamm.instructions.initializeCustomizablePermissionlessConstantProductPool.d8:
        return this.handleInitializePool(instruction, block, offset);

      default:
        throw new Error(`Unknown Meteora instruction type: ${descriptor}`);
    }
  }

  handleAddLiquidity(instruction: Instruction, block: Block, offset: Offset): AddLiquidity {
    const descriptor = getInstructionDescriptor(instruction);

    let decodedInstruction;
    switch (descriptor) {
      case meteoraDamm.instructions.addBalanceLiquidity.d8:
        decodedInstruction = meteoraDamm.instructions.addBalanceLiquidity.decode(instruction);
        break;
      case meteoraDamm.instructions.addImbalanceLiquidity.d8:
        decodedInstruction = meteoraDamm.instructions.addImbalanceLiquidity.decode(instruction);
        break;
      default:
        decodedInstruction = meteoraDamm.instructions.bootstrapLiquidity.decode(instruction);
        break;
    }

    const { lpMint, aTokenVault, user } = decodedInstruction.accounts;
    const tokens = this.poolRepository.getTokens(lpMint);

    const [tokenAAmount, tokenBAmount] = getInnerTransfersByLevel(
      instruction,
      block.instructions,
      2,
    )
      .map((instruction) => {
        const {
          accounts: { destination },
          data: { amount },
        } = tokenProgram.instructions.transfer.decode(instruction);
        return { amount, destination };
      })
      .sort((a, b) => (a.destination === aTokenVault ? -1 : b.destination === aTokenVault ? 1 : 0))
      .map((transfer) => transfer.amount);

    return {
      protocol: this.protocol,
      poolType: this.poolType,
      eventType: 'add',
      lpMint,
      tokenAAmount,
      tokenBAmount,
      blockNumber: block.header.number,
      timestamp: new Date(block.header.timestamp * 1000),
      transactionHash: getTransactionHash(instruction, block),
      transactionIndex: instruction.transactionIndex || 0,
      instruction: instruction.instructionAddress,
      sender: user,
      offset,
      tokenA: tokens?.tokenA || '',
      tokenB: tokens?.tokenB || '',
    };
  }

  handleRemoveLiquidity(instruction: Instruction, block: Block, offset: Offset): RemoveLiquidity {
    const {
      accounts: { lpMint, aTokenVault, user },
    } = meteoraDamm.instructions.removeBalanceLiquidity.decode(instruction);
    const tokens = this.poolRepository.getTokens(lpMint);

    const [tokenAAmount, tokenBAmount] = getInnerTransfersByLevel(
      instruction,
      block.instructions,
      2,
    )
      .map((instruction) => {
        const {
          accounts: { destination },
          data: { amount },
        } = tokenProgram.instructions.transfer.decode(instruction);
        return { amount, destination };
      })
      .sort((a, b) => {
        if (a.destination === aTokenVault) return -1;
        if (b.destination === aTokenVault) return 1;
        return 0;
      })
      .map((transfer) => transfer.amount);

    return {
      protocol: this.protocol,
      poolType: this.poolType,
      eventType: 'remove',
      lpMint,
      tokenAAmount,
      tokenBAmount,
      blockNumber: block.header.number,
      timestamp: new Date(block.header.timestamp * 1000),
      transactionHash: getTransactionHash(instruction, block),
      transactionIndex: instruction.transactionIndex || 0,
      instruction: instruction.instructionAddress,
      sender: user,
      offset,
      tokenA: tokens?.tokenA || '',
      tokenB: tokens?.tokenB || '',
    };
  }

  // TODO: Should understand if removing liquidity from single side has the same effect on the underlying liquidity as a swap
  // or somehow the liquidity maintains the constant product
  handleRemoveLiquiditySingleSide(
    instruction: Instruction,
    block: Block,
    offset: Offset,
  ): RemoveLiquidity {
    const {
      accounts: { lpMint, aTokenVault, user },
    } = meteoraDamm.instructions.removeLiquiditySingleSide.decode(instruction);
    const tokens = this.poolRepository.getTokens(lpMint);

    // As this function removes liquidity and uses a single token to send the liquidity to the user,
    // we only have one internal token transfer instruction
    const [tokenTransfer] = getInnerTransfersByLevel(instruction, block.instructions, 2).map(
      (instruction) => {
        const {
          accounts: { source },
          data: { amount },
        } = tokenProgram.instructions.transfer.decode(instruction);
        return {
          source,
          amount,
          isTokenA: source === aTokenVault,
        };
      },
    );

    let tokenAAmount;
    let tokenBAmount;
    if (tokenTransfer) {
      tokenAAmount = tokenTransfer.isTokenA ? tokenTransfer.amount : 0n;
      tokenBAmount = tokenTransfer.isTokenA ? 0n : tokenTransfer.amount;
    }

    return {
      protocol: this.protocol,
      poolType: this.poolType,
      eventType: 'remove',
      lpMint,
      tokenAAmount: tokenAAmount || 0n,
      tokenBAmount: tokenBAmount || 0n,
      blockNumber: block.header.number,
      timestamp: new Date(block.header.timestamp * 1000),
      transactionHash: getTransactionHash(instruction, block),
      transactionIndex: instruction.transactionIndex || 0,
      instruction: instruction.instructionAddress,
      sender: user,
      offset,
      tokenA: tokens?.tokenA || '',
      tokenB: tokens?.tokenB || '',
    };
  }

  handleInitializePool(
    instruction: Instruction,
    block: Block,
    offset: Offset,
  ): InitializeLiquidity {
    const descriptor = getInstructionDescriptor(instruction);
    
    // Common structure for both permissioned and permissionless pools
    let lpMint: string;
    let tokenAMint: string;
    let tokenBMint: string;
    let tokenAReservesAccount: string;
    let tokenBReservesAccount: string;
    let tokenAAmount = 0n;
    let tokenBAmount = 0n;

    // Permissioned pools doesn't initialize the reserves
    if (descriptor === meteoraDamm.instructions.initializePermissionedPool.d8) {
      ({
        accounts: {
          lpMint,
          tokenAMint,
          tokenBMint,
          aVault: tokenAReservesAccount,
          bVault: tokenBReservesAccount,
        },
      } = meteoraDamm.instructions.initializePermissionedPool.decode(instruction));
    } else {
      ({
        accounts: {
          lpMint,
          tokenAMint,
          tokenBMint,
          aVault: tokenAReservesAccount,
          bVault: tokenBReservesAccount,
        },
        data: { tokenAAmount, tokenBAmount },
      } = meteoraDamm.instructions.initializePermissionlessPoolWithFeeTier.decode(instruction));
    }

    const createAccountInstruction = getNextInstruction(instruction, block.instructions);
    const {
      accounts: { fundingAccount: sender },
    } = systemProgram.instructions.createAccount.decode(createAccountInstruction);

    return {
      protocol: this.protocol,
      poolType: this.poolType,
      eventType: 'initialize',
      lpMint,
      tokenA: tokenAMint,
      tokenB: tokenBMint,
      tokenAReservesAccount,
      tokenBReservesAccount,
      tokenAAmount,
      tokenBAmount,
      blockNumber: block.header.number,
      initTimestamp: BigInt(block.header.timestamp),
      timestamp: new Date(block.header.timestamp * 1000),
      transactionHash: getTransactionHash(instruction, block),
      transactionIndex: instruction.transactionIndex || 0,
      instruction: instruction.instructionAddress,
      sender,
      offset,
    };
  }
}
