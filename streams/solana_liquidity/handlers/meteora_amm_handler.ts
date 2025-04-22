import {
  Block,
  getNextInstruction,
  getTransactionHash,
  Instruction,
} from "../../solana_swaps/utils";
import { BaseHandler, SwapLiquidityEvent } from "./base_handler";
import {
  AddLiquidity,
  RemoveLiquidity,
  InitializeLiquidity,
} from "./base_handler";
import * as meteoraDamm from "../../solana_swaps/abi/meteora_damm";
import * as tokenProgram from "../../solana_swaps/abi/tokenProgram";
import * as systemProgram from "../../solana_swaps/abi/system";

export class MeteoraAmmHandler extends BaseHandler {
  constructor() {
    super("meteora", "amm");
  }

  handleInstruction(instruction: Instruction, block: Block) {
    switch (instruction.d8) {
      case meteoraDamm.instructions.addBalanceLiquidity.d8:
      case meteoraDamm.instructions.addImbalanceLiquidity.d8:
      case meteoraDamm.instructions.bootstrapLiquidity.d8:
        return this.handleAddLiquidity(instruction, block);

      case meteoraDamm.instructions.removeBalanceLiquidity.d8:
      case meteoraDamm.instructions.removeLiquiditySingleSide.d8:
        return this.handleRemoveLiquidity(instruction, block);

      case meteoraDamm.instructions.initializePermissionlessPool.d8:
        return this.handleInitializePool(instruction, block);

      case meteoraDamm.instructions.initializePermissionedPool.d8:
      case meteoraDamm.instructions.initializePermissionlessPool.d8:
      case meteoraDamm.instructions.initializePermissionlessPoolWithFeeTier.d8:
      case meteoraDamm.instructions
        .initializePermissionlessConstantProductPoolWithConfig.d8:
      case meteoraDamm.instructions
        .initializePermissionlessConstantProductPoolWithConfig2.d8:
      case meteoraDamm.instructions
        .initializeCustomizablePermissionlessConstantProductPool.d8:
        return this.handleInitializePool(instruction, block);
      case meteoraDamm.instructions.swap.d8:
        return this.handleSwap(instruction, block);
      default:
        throw new Error(`Unknown Meteora instruction type: ${instruction.d8}`);
    }
  }

  getAddBalanceLiquidity(instruction: Instruction) {
    switch (instruction.d8) {
      case meteoraDamm.instructions.addBalanceLiquidity.d8:
        return meteoraDamm.instructions.addBalanceLiquidity.decode(instruction);
      case meteoraDamm.instructions.addImbalanceLiquidity.d8:
        return meteoraDamm.instructions.addImbalanceLiquidity.decode(
          instruction
        );
        break;
      case meteoraDamm.instructions.bootstrapLiquidity.d8:
        return meteoraDamm.instructions.bootstrapLiquidity.decode(instruction);
      default:
        throw new Error(`Unknown add liquidity instruction: ${instruction.d8}`);
    }
  }

  handleAddLiquidity(instruction: Instruction, block: Block): AddLiquidity {
    const decodedInstruction = this.getAddBalanceLiquidity(instruction);

    const { aTokenVault, bTokenVault, user, pool } =
      decodedInstruction.accounts;

    const transfers = this.getTransfers(instruction);
    const tokenATransfer = transfers.find(
      (t) => t.accounts.destination === aTokenVault
    );
    const tokenBTransfer = transfers.find(
      (t) => t.accounts.destination === bTokenVault
    );

    const tx = instruction.getTransaction();
    const tokenABalance = tx.tokenBalances.find(
      (tb) => tb.account === aTokenVault
    );
    const tokenBBalance = tx.tokenBalances.find(
      (tb) => tb.account === bTokenVault
    );

    return {
      protocol: this.protocol,
      pool,
      poolType: this.poolType,
      eventType: "add",
      tokenAMint: tokenABalance?.preMint ?? "",
      tokenBMint: tokenBBalance?.preMint ?? "",
      tokenAAmount: tokenATransfer?.data.amount ?? 0n,
      tokenBAmount: tokenBTransfer?.data.amount ?? 0n,
      tokenADecimals: tokenABalance?.preDecimals ?? 0,
      tokenBDecimals: tokenBBalance?.preDecimals ?? 0,
      tokenABalance: tokenABalance?.postAmount ?? 0n,
      tokenBBalance: tokenBBalance?.postAmount ?? 0n,
      tokenAVault: aTokenVault,
      tokenBVault: bTokenVault,
      blockNumber: block.header.number,
      timestamp: new Date(block.header.timestamp * 1000),
      transactionHash: getTransactionHash(instruction, block),
      transactionIndex: instruction.transactionIndex || 0,
      instruction: instruction.instructionAddress,
      sender: user,
    };
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

  getTransfers(ins: Instruction) {
    return ins.inner
      .filter((i) => {
        switch (i.d1) {
          case tokenProgram.instructions.transferChecked.d1:
          case tokenProgram.instructions.transfer.d1:
            return true;
          default:
            return false;
        }
      })
      .map((i) => this.decodeTransfer(i));
  }

  getRemoveBalanceLiquidity(instruction: Instruction) {
    switch (instruction.d8) {
      case meteoraDamm.instructions.removeBalanceLiquidity.d8:
        return meteoraDamm.instructions.removeBalanceLiquidity.decode(
          instruction
        );
      case meteoraDamm.instructions.removeLiquiditySingleSide.d8:
        return meteoraDamm.instructions.removeLiquiditySingleSide.decode(
          instruction
        );
      case meteoraDamm.instructions.removeLiquiditySingleSide.d8:
        return meteoraDamm.instructions.removeLiquiditySingleSide.decode(
          instruction
        );
      default:
        throw new Error(
          `Unknown remove liquidity instruction: ${instruction.d8}`
        );
    }
  }

  handleRemoveLiquidity(
    instruction: Instruction,
    block: Block
  ): RemoveLiquidity {
    const decodedInstruction = this.getRemoveBalanceLiquidity(instruction);

    const { aTokenVault, bTokenVault, user, pool } =
      decodedInstruction.accounts;

    const transfers = this.getTransfers(instruction);
    const tokenATransfer = transfers.find(
      (t) => t.accounts.source === aTokenVault
    );
    const tokenBTransfer = transfers.find(
      (t) => t.accounts.source === bTokenVault
    );

    const tx = instruction.getTransaction();
    const tokenABalance = tx.tokenBalances.find(
      (tb) => tb.account === aTokenVault
    );
    const tokenBBalance = tx.tokenBalances.find(
      (tb) => tb.account === bTokenVault
    );

    return {
      pool,
      protocol: this.protocol,
      poolType: this.poolType,
      eventType: "remove",
      tokenAMint: tokenABalance?.preMint ?? "",
      tokenBMint: tokenBBalance?.preMint ?? "",
      tokenAAmount: (tokenATransfer?.data.amount ?? 0n) * -1n,
      tokenBAmount: (tokenBTransfer?.data.amount ?? 0n) * -1n,
      tokenADecimals: tokenABalance?.preDecimals ?? 0,
      tokenBDecimals: tokenBBalance?.preDecimals ?? 0,
      tokenABalance: tokenABalance?.postAmount ?? 0n,
      tokenBBalance: tokenBBalance?.postAmount ?? 0n,
      tokenAVault: aTokenVault,
      tokenBVault: bTokenVault,
      blockNumber: block.header.number,
      timestamp: new Date(block.header.timestamp * 1000),
      transactionHash: tx.signatures[0],
      transactionIndex: instruction.transactionIndex || 0,
      instruction: instruction.instructionAddress,
      sender: user,
    };
  }

  getInitialize(instruction: Instruction) {
    switch (instruction.d8) {
      case meteoraDamm.instructions.initializePermissionedPool.d8:
        return meteoraDamm.instructions.initializePermissionedPool.decode(
          instruction
        );
      case meteoraDamm.instructions.initializePermissionlessPoolWithFeeTier.d8:
        return meteoraDamm.instructions.initializePermissionlessPoolWithFeeTier.decode(
          instruction
        );
      case meteoraDamm.instructions
        .initializePermissionlessConstantProductPoolWithConfig.d8:
        return meteoraDamm.instructions.initializePermissionlessConstantProductPoolWithConfig.decode(
          instruction
        );
      case meteoraDamm.instructions
        .initializePermissionlessConstantProductPoolWithConfig2.d8:
        return meteoraDamm.instructions.initializePermissionlessConstantProductPoolWithConfig2.decode(
          instruction
        );
      case meteoraDamm.instructions
        .initializeCustomizablePermissionlessConstantProductPool.d8:
        return meteoraDamm.instructions.initializeCustomizablePermissionlessConstantProductPool.decode(
          instruction
        );
      default:
        throw new Error(`Unknown initialize instruction: ${instruction.d8}`);
    }
  }

  handleSwap(instruction: Instruction, block: Block): SwapLiquidityEvent {
    const {
      accounts: { aTokenVault, bTokenVault, pool },
    } = meteoraDamm.instructions.swap.decode(instruction);

    const transfers = this.getTransfers(instruction);
    const tokenATransferIn = transfers.find(
      (t) => t.accounts.source === aTokenVault
    );
    const tokenBTransferIn = transfers.find(
      (t) => t.accounts.source === bTokenVault
    );
    const tokenATransferOut = transfers.find(
      (t) => t.accounts.destination === aTokenVault
    );
    const tokenBTransferOut = transfers.find(
      (t) => t.accounts.destination === bTokenVault
    );

    const tx = instruction.getTransaction();
    const tokenABalance = tx.tokenBalances.find(
      (tb) => tb.account === aTokenVault
    );
    const tokenBBalance = tx.tokenBalances.find(
      (tb) => tb.account === bTokenVault
    );

    return {
      pool,
      protocol: this.protocol,
      poolType: this.poolType,
      eventType: "swap",
      tokenAMint: tokenABalance?.preMint ?? "",
      tokenBMint: tokenABalance?.preMint ?? "",
      tokenAAmount: tokenATransferIn
        ? tokenATransferIn.data.amount
        : (tokenATransferOut?.data.amount ?? 0n) * -1n,
      tokenBAmount: tokenBTransferIn
        ? tokenBTransferIn.data.amount
        : (tokenBTransferOut?.data.amount ?? 0n) * -1n,
      tokenABalance: tokenABalance?.postAmount ?? 0n,
      tokenBBalance: tokenBBalance?.postAmount ?? 0n,
      tokenADecimals: tokenABalance?.postDecimals ?? 0,
      tokenBDecimals: tokenBBalance?.postDecimals ?? 0,
      tokenAVault: aTokenVault,
      tokenBVault: bTokenVault,
      blockNumber: block.header.number,
      timestamp: new Date(block.header.timestamp * 1000),
      transactionHash: getTransactionHash(instruction, block),
      transactionIndex: instruction.transactionIndex || 0,
      instruction: instruction.instructionAddress,
    };
  }

  handleInitializePool(
    instruction: Instruction,
    block: Block
  ): InitializeLiquidity {
    const {
      accounts: { pool, lpMint, tokenAMint, tokenBMint, ...accounts },
    } = this.getInitialize(instruction);

    const aTokenVault =
      "aTokenVault" in accounts ? accounts.aTokenVault : undefined;
    const bTokenVault =
      "bTokenVault" in accounts ? accounts.bTokenVault : undefined;

    const createAccountInstruction = getNextInstruction(
      instruction,
      block.instructions
    );
    const {
      accounts: { fundingAccount: sender },
    } = systemProgram.instructions.createAccount.decode(
      createAccountInstruction
    );

    const transfers = this.getTransfers(instruction);
    const tokenATransfer = transfers.find(
      (t) => t.accounts.destination === aTokenVault
    );
    const tokenBTransfer = transfers.find(
      (t) => t.accounts.destination === bTokenVault
    );

    const tx = instruction.getTransaction();
    const tokenABalance = tx.tokenBalances.find(
      (tb) => tb.account === aTokenVault
    );
    const tokenBBalance = tx.tokenBalances.find(
      (tb) => tb.account === bTokenVault
    );

    return {
      pool,
      protocol: this.protocol,
      poolType: this.poolType,
      eventType: "initialize",
      tokenAMint: tokenAMint,
      tokenBMint: tokenBMint,
      tokenAVault: aTokenVault ?? "",
      tokenBVault: bTokenVault ?? "",
      tokenAAmount: tokenATransfer?.data.amount ?? 0n,
      tokenBAmount: tokenBTransfer?.data.amount ?? 0n,
      tokenABalance: tokenABalance?.postAmount ?? 0n,
      tokenBBalance: tokenBBalance?.postAmount ?? 0n,
      tokenADecimals: tokenABalance?.postDecimals ?? 0,
      tokenBDecimals: tokenBBalance?.postDecimals ?? 0,
      blockNumber: block.header.number,
      timestamp: new Date(block.header.timestamp * 1000),
      transactionHash: getTransactionHash(instruction, block),
      transactionIndex: instruction.transactionIndex || 0,
      instruction: instruction.instructionAddress,
      sender,
    };
  }
}
