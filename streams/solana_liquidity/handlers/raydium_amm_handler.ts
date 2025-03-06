import { BaseHandler } from './base_handler';
import * as raydium_amm from '../../solana_swaps/abi/raydium_amm';
import * as tokenProgram from '../../solana_swaps/abi/tokenProgram';
import {
  Block,
  getInnerTransfersByLevel,
  getInstructionD1,
  getTransactionHash,
  Instruction,
} from '../../solana_swaps/utils';
import { AddLiquidity, RemoveLiquidity, InitializeLiquidity } from './base_handler';
import { Offset } from 'core/abstract_stream';
import { PoolRepository } from '../repository/pool_repository';
export class RaydiumAmmHandler extends BaseHandler {
  constructor(poolRepository: PoolRepository) {
    super('raydium', 'amm', poolRepository);
  }

  handleInstruction(instruction: Instruction, block: Block, offset: Offset) {
    const descriptor = getInstructionD1(instruction);

    switch (descriptor) {
      case raydium_amm.instructions.deposit.d1:
        return this.handleAddLiquidity(instruction, block, offset);
      case raydium_amm.instructions.withdraw.d1:
        return this.handleRemoveLiquidity(instruction, block, offset);
      case raydium_amm.instructions.initialize2.d1:
        return this.handleInitializePool(instruction, block, offset);
      default:
        throw new Error(`Unknown instruction: ${descriptor}`);
    }
  }

  handleAddLiquidity(instruction: Instruction, block: Block, offset: Offset): AddLiquidity {
    const depositInstruction = raydium_amm.instructions.deposit.decode(instruction);
    const {
      accounts: { poolCoinTokenAccount, lpMintAddress },
    } = depositInstruction;
    const tokens = this.poolRepository.getTokens(lpMintAddress);

    const [coinAmount, pcAmount] = getInnerTransfersByLevel(instruction, block.instructions, 1)
      .map((instruction) => {
        const {
          accounts: { destination, source },
          data: { amount },
        } = tokenProgram.instructions.transfer.decode(instruction);

        return {
          amount,
          destination,
          source,
        };
      })
      .sort((a, b) => {
        if (a.destination === poolCoinTokenAccount) return -1;
        if (b.destination === poolCoinTokenAccount) return 1;
        return 0;
      })
      .map((transfer) => transfer.amount);

    return {
      protocol: this.protocol,
      poolType: this.poolType,
      eventType: 'add',
      lpMint: lpMintAddress,
      tokenAAmount: coinAmount,
      tokenBAmount: pcAmount,
      tokenA: tokens?.tokenA || '',
      tokenB: tokens?.tokenB || '',
      blockNumber: block.header.number,
      transactionHash: getTransactionHash(instruction, block),
      transactionIndex: instruction.transactionIndex || 0,
      instruction: instruction.instructionAddress,
      sender: this.getSender(instruction, block),
      timestamp: new Date(block.header.timestamp * 1000),
      offset,
    };
  }

  handleRemoveLiquidity(instruction: Instruction, block: Block, offset: Offset): RemoveLiquidity {
    const withdrawInstruction = raydium_amm.instructions.withdraw.decode(instruction);
    const {
      accounts: { poolCoinTokenAccount, lpMintAddress },
    } = withdrawInstruction;
    const tokens = this.poolRepository.getTokens(lpMintAddress);

    const [coinAmount, pcAmount] = getInnerTransfersByLevel(instruction, block.instructions, 1)
      .map((instruction) => {
        const decodedTransfer = tokenProgram.instructions.transfer.decode(instruction);
        return {
          amount: decodedTransfer.data.amount,
          destination: decodedTransfer.accounts.destination,
        };
      })
      .sort((a, b) => {
        if (a.destination === poolCoinTokenAccount) return -1;
        if (b.destination === poolCoinTokenAccount) return 1;
        return 0;
      })
      .map((transfer) => transfer.amount);

    return {
      protocol: this.protocol,
      poolType: this.poolType,
      eventType: 'remove',
      lpMint: lpMintAddress,
      tokenAAmount: coinAmount,
      tokenBAmount: pcAmount,
      tokenA: tokens?.tokenA || '',
      tokenB: tokens?.tokenB || '',
      blockNumber: block.header.number,
      transactionHash: getTransactionHash(instruction, block),
      transactionIndex: instruction.transactionIndex || 0,
      instruction: instruction.instructionAddress,
      sender: this.getSender(instruction, block),
      timestamp: new Date(block.header.timestamp * 1000),
      offset,
    };
  }

  handleInitializePool(
    instruction: Instruction,
    block: Block,
    offset: Offset,
  ): InitializeLiquidity {
    const initialize2Instruction = raydium_amm.instructions.initialize2.decode(instruction);

    const {
      accounts: { poolCoinTokenAccount, poolPcTokenAccount, coinMint, pcMint, lpMint },
      data: { initCoinAmount, initPcAmount, openTime },
    } = initialize2Instruction;

    return {
      protocol: this.protocol,
      poolType: this.poolType,
      eventType: 'initialize',
      lpMint,
      tokenA: coinMint,
      tokenB: pcMint,
      tokenAReservesAccount: poolCoinTokenAccount,
      tokenBReservesAccount: poolPcTokenAccount,
      tokenAAmount: initCoinAmount,
      tokenBAmount: initPcAmount,
      initTimestamp: openTime,
      blockNumber: block.header.number,
      timestamp: new Date(block.header.timestamp * 1000),
      transactionHash: getTransactionHash(instruction, block),
      transactionIndex: instruction.transactionIndex || 0,
      instruction: instruction.instructionAddress,
      sender: this.getSender(instruction, block),
      offset,
    };
  }

  private getSender(instruction: Instruction, block: Block): string {
    const [transfer] = getInnerTransfersByLevel(instruction, block.instructions, 1);
    const decodedTransfer = tokenProgram.instructions.transfer.decode(transfer);
    return decodedTransfer.accounts.authority;
  }
}
