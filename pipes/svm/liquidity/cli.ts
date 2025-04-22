import { createLogger } from "../../utils";
import path from "node:path";
import {
  createClickhouseClient,
  ensureTables,
  toUnixTime,
} from "../../clickhouse";
import { ClickhouseState } from "../../../core/states/clickhouse_state";
import { SolanaLiquidityStream } from "../../../streams/solana_liquidity";

async function main() {
  const clickhouse = createClickhouseClient();
  const logger = createLogger("solana_liquidity");

  const ds = new SolanaLiquidityStream({
    portal: "https://portal.sqd.dev/datasets/solana-mainnet",
    blockRange: {
      from: process.env.FROM_BLOCK || 317617480,
      to: process.env.TO_BLOCK,
    },
    args: {
      type: ["orca", "raydium", "meteora"],
    },
    logger,
    state: new ClickhouseState(clickhouse, {
      table: "solana_sync_status",
      id: "solana_liquidity",
    }),
  });

  await ensureTables(clickhouse, path.join(__dirname, "liquidity.sql"));

  const stream = await ds.stream();

  for await (const liquidityEvents of stream) {
    await clickhouse.insert({
      table: "solana_liquidity_transactions",
      format: "JSONEachRow",
      values: liquidityEvents.map((liquidityEvent) => {
        return {
          protocol: liquidityEvent.protocol,
          pool_type: liquidityEvent.poolType,
          pool: liquidityEvent.pool,
          timestamp: toUnixTime(liquidityEvent.timestamp),
          event_type: liquidityEvent.eventType,
          token_a_mint: liquidityEvent.tokenAMint,
          token_b_mint: liquidityEvent.tokenBMint,
          token_a_vault: liquidityEvent.tokenAVault,
          token_b_vault: liquidityEvent.tokenBVault,
          token_a_amount_raw: liquidityEvent.tokenAAmount.toString(),
          token_b_amount_raw: liquidityEvent.tokenBAmount.toString(),
          token_a_balance_raw: liquidityEvent.tokenABalance.toString(),
          token_b_balance_raw: liquidityEvent.tokenBBalance.toString(),
          token_a_decimals: liquidityEvent.tokenADecimals,
          token_b_decimals: liquidityEvent.tokenBDecimals,
          sender: liquidityEvent.sender,
          block_number: liquidityEvent.blockNumber,
          transaction_hash: liquidityEvent.transactionHash,
          transaction_index: liquidityEvent.transactionIndex,
          instruction: liquidityEvent.instruction,
          sign: 1,
        };
      }),
    });

    await ds.ack();
  }
}

void main();
