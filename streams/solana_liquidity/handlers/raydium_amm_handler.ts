import { BaseHandler } from "./base_handler";
import * as raydium_amm from "../../solana_swaps/abi/raydium_amm";
import * as tokenProgram from "../../solana_swaps/abi/tokenProgram";
import {
  Block,
  getInnerTransfersByLevel,
  getInstructionD1,
  getTransactionHash,
  Instruction,
} from "../../solana_swaps/utils";
import {
  AddLiquidity,
  RemoveLiquidity,
  InitializeLiquidity,
  SwapLiquidityEvent,
} from "./base_handler";

export class RaydiumAmmHandler extends BaseHandler {
  constructor() {
    super("raydium", "amm");
  }

  handleInstruction(
    instruction: Instruction,
    block: Block
  ): AddLiquidity | RemoveLiquidity | InitializeLiquidity | SwapLiquidityEvent {
    const descriptor = getInstructionD1(instruction);
    switch (descriptor) {
      case raydium_amm.instructions.deposit.d1:
        return this.handleAddLiquidity(instruction, block);
      case raydium_amm.instructions.withdraw.d1:
        return this.handleRemoveLiquidity(instruction, block);
      case raydium_amm.instructions.initialize2.d1:
        return this.handleInitializePool(instruction, block);
      case raydium_amm.instructions.swapBaseIn.d1:
      case raydium_amm.instructions.swapBaseOut.d1:
        return this.handleSwap(instruction, block);
      default:
        throw new Error(`Unknown instruction: ${descriptor}`);
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
    const depositInstruction =
      raydium_amm.instructions.deposit.decode(instruction);
    const {
      accounts: { poolCoinTokenAccount, amm, poolPcTokenAccount },
    } = depositInstruction;

    const transfers = this.getTransfers(instruction);
    const tokenATransfer = transfers.find(
      (t) => t.accounts.destination === poolCoinTokenAccount
    );
    const tokenBTransfer = transfers.find(
      (t) => t.accounts.destination === poolPcTokenAccount
    );

    const tx = instruction.getTransaction();
    const tokenABalance = tx.tokenBalances.find(
      (tb) => tb.account === poolCoinTokenAccount
    );
    const tokenBBalance = tx.tokenBalances.find(
      (tb) => tb.account === poolPcTokenAccount
    );

    return {
      pool: amm,
      protocol: this.protocol,
      poolType: this.poolType,
      eventType: "add",
      tokenAAmount: tokenATransfer?.data.amount ?? 0n,
      tokenBAmount: tokenBTransfer?.data.amount ?? 0n,
      tokenAMint: tokenABalance?.preMint ?? "",
      tokenBMint: tokenBBalance?.preMint ?? "",
      blockNumber: block.header.number,
      tokenABalance: tokenABalance?.postAmount ?? 0n,
      tokenBBalance: tokenBBalance?.postAmount ?? 0n,
      tokenADecimals: tokenABalance?.preDecimals ?? 0,
      tokenBDecimals: tokenBBalance?.preDecimals ?? 0,
      tokenAVault: poolCoinTokenAccount,
      tokenBVault: poolPcTokenAccount,
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
    const withdrawInstruction =
      raydium_amm.instructions.withdraw.decode(instruction);
    const {
      accounts: { poolCoinTokenAccount, amm, poolPcTokenAccount },
    } = withdrawInstruction;

    const transfers = this.getTransfers(instruction);
    const tokenATransfer = transfers.find(
      (t) => t.accounts.source === poolCoinTokenAccount
    );
    const tokenBTransfer = transfers.find(
      (t) => t.accounts.source === poolPcTokenAccount
    );

    const tx = instruction.getTransaction();
    const tokenABalance = tx.tokenBalances.find(
      (tb) => tb.account === poolCoinTokenAccount
    );
    const tokenBBalance = tx.tokenBalances.find(
      (tb) => tb.account === poolPcTokenAccount
    );

    return {
      pool: amm,
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
      tokenAVault: poolCoinTokenAccount,
      tokenBVault: poolPcTokenAccount,
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
    const initialize2Instruction =
      raydium_amm.instructions.initialize2.decode(instruction);

    const {
      accounts: { poolCoinTokenAccount, poolPcTokenAccount, amm },
    } = initialize2Instruction;

    const transfers = this.getTransfers(instruction);
    const tokenATransfer = transfers.find(
      (t) => t.accounts.destination === poolCoinTokenAccount
    );
    const tokenBTransfer = transfers.find(
      (t) => t.accounts.destination === poolPcTokenAccount
    );

    const tx = instruction.getTransaction();
    const tokenABalance = tx.tokenBalances.find(
      (tb) => tb.account === poolCoinTokenAccount
    );
    const tokenBBalance = tx.tokenBalances.find(
      (tb) => tb.account === poolPcTokenAccount
    );

    return {
      pool: amm,
      protocol: this.protocol,
      poolType: this.poolType,
      eventType: "initialize",
      tokenAAmount: tokenATransfer?.data.amount ?? 0n,
      tokenBAmount: tokenBTransfer?.data.amount ?? 0n,
      tokenAMint: tokenABalance?.postMint ?? "",
      tokenBMint: tokenBBalance?.postMint ?? "",
      tokenABalance: tokenABalance?.postAmount ?? 0n,
      tokenBBalance: tokenBBalance?.postAmount ?? 0n,
      tokenADecimals: tokenABalance?.postDecimals ?? 0,
      tokenBDecimals: tokenBBalance?.postDecimals ?? 0,
      tokenAVault: poolCoinTokenAccount,
      tokenBVault: poolPcTokenAccount,
      blockNumber: block.header.number,
      timestamp: new Date(block.header.timestamp * 1000),
      transactionHash: getTransactionHash(instruction, block),
      transactionIndex: instruction.transactionIndex || 0,
      instruction: instruction.instructionAddress,
      sender: this.getSender(instruction, block),
    };
  }

  private handleSwap(
    instruction: Instruction,
    block: Block
  ): SwapLiquidityEvent {
    const swapInstruction =
      instruction.d1 === raydium_amm.instructions.swapBaseIn.d1
        ? raydium_amm.instructions.swapBaseIn.decode(instruction)
        : raydium_amm.instructions.swapBaseOut.decode(instruction);

    let {
      accounts: {
        poolCoinTokenAccount,
        poolPcTokenAccount,
        amm,
        ammTargetOrders,
      },
    } = swapInstruction;

    const tx = instruction.getTransaction();
    let tokenABalance = tx.tokenBalances.find(
      (tb) => tb.account === poolCoinTokenAccount
    );
    let tokenBBalance = tx.tokenBalances.find(
      (tb) => tb.account === poolPcTokenAccount
    );

    // sometimes account layout doesn't match the expected layout and we need to offset the accounts
    if (!tokenBBalance) {
      poolPcTokenAccount = poolCoinTokenAccount;
      poolCoinTokenAccount = ammTargetOrders;
      tokenABalance = tx.tokenBalances.find(
        (tb) => tb.account === poolCoinTokenAccount
      );
      tokenBBalance = tx.tokenBalances.find(
        (tb) => tb.account === poolPcTokenAccount
      );
    }

    const transfers = this.getTransfers(instruction);
    const tokenATransferIn = transfers.find(
      (t) => t.accounts.destination === poolCoinTokenAccount
    );
    const tokenBTransferIn = transfers.find(
      (t) => t.accounts.destination === poolPcTokenAccount
    );
    const tokenATransferOut = transfers.find(
      (t) => t.accounts.source === poolCoinTokenAccount
    );
    const tokenBTransferOut = transfers.find(
      (t) => t.accounts.source === poolPcTokenAccount
    );

    return {
      pool: amm,
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
      tokenAVault: poolCoinTokenAccount,
      tokenBVault: poolPcTokenAccount,
      blockNumber: block.header.number,
      transactionHash: getTransactionHash(instruction, block),
      transactionIndex: instruction.transactionIndex || 0,
      instruction: instruction.instructionAddress,
      sender: this.getSender(instruction, block),
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
