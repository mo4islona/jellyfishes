import { BaseHandler } from "./base_handler";
import * as whirlpool from "../../solana_swaps/abi/orca_whirlpool";
import * as tokenProgram from "../../solana_swaps/abi/tokenProgram";
import {
  Block,
  getInnerTransfersByLevel,
  getTransactionHash,
  Instruction,
} from "../../solana_swaps/utils";
import {
  AddLiquidity,
  RemoveLiquidity,
  InitializeLiquidity,
  SwapLiquidityEvent,
} from "./base_handler";

export class OrcaWhirlpoolHandler extends BaseHandler {
  constructor() {
    super("orca", "clmm");
  }

  handleInstruction(
    instruction: Instruction,
    block: Block
  ): AddLiquidity | RemoveLiquidity | InitializeLiquidity | SwapLiquidityEvent {
    switch (instruction.d8) {
      case whirlpool.instructions.increaseLiquidity.d8:
        return this.handleAddLiquidity(instruction, block);
      case whirlpool.instructions.decreaseLiquidity.d8:
        return this.handleRemoveLiquidity(instruction, block);
      case whirlpool.instructions.initializePool.d8:
      case whirlpool.instructions.initializePoolV2.d8:
        return this.handleInitializePool(instruction, block);
      case whirlpool.instructions.swap.d8:
        return this.handleSwap(instruction, block);
      default:
        throw new Error(`Unknown instruction: ${instruction.d8}`);
    }
  }

  getTransfers(ins: Instruction) {
    const inner = ins.inner.filter((i) => {
      switch (i.d1) {
        case tokenProgram.instructions.transferChecked.d1:
        case tokenProgram.instructions.transfer.d1:
          return true;
        default:
          return false;
      }
    });

    return inner.map((i) => this.decodeTransfer(i));
  }

  decodeTransfer(ins: Instruction) {
    switch (ins.d1) {
      case tokenProgram.instructions.transferChecked.d1:
        return tokenProgram.instructions.transferChecked.decode(ins);
      case tokenProgram.instructions.transfer.d1:
        return tokenProgram.instructions.transfer.decode(ins);
      default:
        throw new Error(`Unknown token transfer instruction: ${ins.d1}`);
    }
  }

  handleAddLiquidity(instruction: Instruction, block: Block): AddLiquidity {
    const increaseLiquidityInstruction =
      whirlpool.instructions.increaseLiquidity.decode(instruction);
    const {
      accounts: { whirlpool: pool, tokenVaultA, tokenVaultB },
    } = increaseLiquidityInstruction;

    const transfers = this.getTransfers(instruction);
    const tokenATransfer = transfers.find(
      (t) => t.accounts.destination === tokenVaultA
    );
    const tokenBTransfer = transfers.find(
      (t) => t.accounts.destination === tokenVaultB
    );

    const tx = instruction.getTransaction();
    const tokenABalance = tx.tokenBalances.find(
      (tb) => tb.account === tokenVaultA
    );
    const tokenBBalance = tx.tokenBalances.find(
      (tb) => tb.account === tokenVaultB
    );

    return {
      pool,
      protocol: this.protocol,
      poolType: this.poolType,
      eventType: "add",
      tokenAAmount: tokenATransfer?.data.amount ?? 0n,
      tokenBAmount: tokenBTransfer?.data.amount ?? 0n,
      tokenAMint: tokenABalance?.preMint ?? "",
      tokenBMint: tokenBBalance?.preMint ?? "",
      tokenABalance: tokenABalance?.postAmount ?? 0n,
      tokenBBalance: tokenBBalance?.postAmount ?? 0n,
      tokenADecimals: tokenABalance?.preDecimals ?? 0,
      tokenBDecimals: tokenBBalance?.preDecimals ?? 0,
      tokenAVault: tokenVaultA,
      tokenBVault: tokenVaultB,
      blockNumber: block.header.number,
      transactionHash: getTransactionHash(instruction, block),
      transactionIndex: instruction.transactionIndex || 0,
      instruction: instruction.instructionAddress,
      sender: this.getSender(instruction, block),
      timestamp: new Date(block.header.timestamp * 1000),
    };
  }

  handleRemoveLiquidity(
    instruction: Instruction,
    block: Block
  ): RemoveLiquidity {
    const decreaseLiquidityInstruction =
      whirlpool.instructions.decreaseLiquidity.decode(instruction);
    const {
      accounts: { whirlpool: pool, tokenVaultA, tokenVaultB },
    } = decreaseLiquidityInstruction;

    const transfers = this.getTransfers(instruction);
    const tokenATransfer = transfers.find(
      (t) => t.accounts.source === tokenVaultA
    );
    const tokenBTransfer = transfers.find(
      (t) => t.accounts.source === tokenVaultB
    );

    const tx = instruction.getTransaction();
    const tokenABalance = tx.tokenBalances.find(
      (tb) => tb.account === tokenVaultA
    );
    const tokenBBalance = tx.tokenBalances.find(
      (tb) => tb.account === tokenVaultB
    );

    return {
      pool,
      protocol: this.protocol,
      poolType: this.poolType,
      eventType: "remove",
      tokenAAmount: (tokenATransfer?.data.amount ?? 0n) * -1n,
      tokenBAmount: (tokenBTransfer?.data.amount ?? 0n) * -1n,
      tokenAMint: tokenABalance?.preMint ?? "",
      tokenBMint: tokenBBalance?.preMint ?? "",
      tokenABalance: tokenABalance?.postAmount ?? 0n,
      tokenBBalance: tokenBBalance?.postAmount ?? 0n,
      tokenADecimals: tokenABalance?.preDecimals ?? 0,
      tokenBDecimals: tokenBBalance?.preDecimals ?? 0,
      tokenAVault: tokenVaultA,
      tokenBVault: tokenVaultB,
      blockNumber: block.header.number,
      transactionHash: getTransactionHash(instruction, block),
      transactionIndex: instruction.transactionIndex || 0,
      instruction: instruction.instructionAddress,
      sender: this.getSender(instruction, block),
      timestamp: new Date(block.header.timestamp * 1000),
    };
  }

  handleInitializePool(
    instruction: Instruction,
    block: Block
  ): InitializeLiquidity {
    const initializePoolInstruction =
      instruction.d8 === whirlpool.instructions.initializePool.d8
        ? whirlpool.instructions.initializePool.decode(instruction)
        : whirlpool.instructions.initializePoolV2.decode(instruction);
    const {
      accounts: {
        whirlpool: pool,
        tokenVaultA,
        tokenVaultB,
        tokenMintA,
        tokenMintB,
      },
    } = initializePoolInstruction;

    const transfers = this.getTransfers(instruction);
    const tokenATransfer = transfers.find(
      (t) => t.accounts.destination === tokenVaultA
    );
    const tokenBTransfer = transfers.find(
      (t) => t.accounts.destination === tokenVaultB
    );

    const tx = instruction.getTransaction();
    const tokenABalance = tx.tokenBalances.find(
      (tb) => tb.account === tokenVaultA
    );
    const tokenBBalance = tx.tokenBalances.find(
      (tb) => tb.account === tokenVaultB
    );

    return {
      pool,
      protocol: this.protocol,
      poolType: this.poolType,
      eventType: "initialize",
      tokenAMint: tokenMintA,
      tokenBMint: tokenMintB,
      tokenAAmount: tokenATransfer?.data.amount ?? 0n,
      tokenBAmount: tokenBTransfer?.data.amount ?? 0n,
      tokenABalance: tokenABalance?.postAmount ?? 0n,
      tokenBBalance: tokenBBalance?.postAmount ?? 0n,
      tokenADecimals: tokenABalance?.postDecimals ?? 0,
      tokenBDecimals: tokenBBalance?.postDecimals ?? 0,
      tokenAVault: tokenVaultA,
      tokenBVault: tokenVaultB,
      blockNumber: block.header.number,
      transactionHash: getTransactionHash(instruction, block),
      transactionIndex: instruction.transactionIndex || 0,
      instruction: instruction.instructionAddress,
      timestamp: new Date(block.header.timestamp * 1000),
    };
  }

  private handleSwap(
    instruction: Instruction,
    block: Block
  ): SwapLiquidityEvent {
    const swapInstruction = whirlpool.instructions.swap.decode(instruction);
    const {
      accounts: { whirlpool: pool, tokenVaultA, tokenVaultB },
    } = swapInstruction;

    const transfers = this.getTransfers(instruction);
    const tokenATransferIn = transfers.find(
      (t) => t.accounts.destination === tokenVaultA
    );
    const tokenBTransferIn = transfers.find(
      (t) => t.accounts.destination === tokenVaultB
    );
    const tokenATransferOut = transfers.find(
      (t) => t.accounts.source === tokenVaultA
    );
    const tokenBTransferOut = transfers.find(
      (t) => t.accounts.source === tokenVaultB
    );

    const tx = instruction.getTransaction();
    const tokenABalance = tx.tokenBalances.find(
      (tb) => tb.account === tokenVaultA
    );
    const tokenBBalance = tx.tokenBalances.find(
      (tb) => tb.account === tokenVaultB
    );

    return {
      pool,
      protocol: this.protocol,
      poolType: this.poolType,
      eventType: "swap",
      tokenAAmount: tokenATransferIn
        ? tokenATransferIn.data.amount
        : (tokenATransferOut?.data.amount ?? 0n) * -1n,
      tokenBAmount: tokenBTransferIn
        ? tokenBTransferIn.data.amount
        : (tokenBTransferOut?.data.amount ?? 0n) * -1n,
      tokenAMint: tokenABalance?.preMint ?? "",
      tokenBMint: tokenBBalance?.preMint ?? "",
      tokenABalance: tokenABalance?.postAmount ?? 0n,
      tokenBBalance: tokenBBalance?.postAmount ?? 0n,
      tokenADecimals: tokenABalance?.preDecimals ?? 0,
      tokenBDecimals: tokenBBalance?.preDecimals ?? 0,
      tokenAVault: tokenVaultA,
      tokenBVault: tokenVaultB,
      blockNumber: block.header.number,
      transactionHash: getTransactionHash(instruction, block),
      transactionIndex: instruction.transactionIndex || 0,
      instruction: instruction.instructionAddress,
      timestamp: new Date(block.header.timestamp * 1000),
    };
  }

  private getSender(instruction: Instruction, block: Block): string {
    const [transfer] = getInnerTransfersByLevel(
      instruction,
      block.instructions,
      1
    );
    const decodedTransfer = tokenProgram.instructions.transfer.decode(transfer);
    return decodedTransfer.accounts.authority;
  }
}
