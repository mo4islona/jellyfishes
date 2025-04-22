import { createLogger, formatNumber } from '../../examples/utils';
import path from 'node:path';
import {
  cleanAllBeforeOffset,
  createClickhouseClient,
  ensureTables,
  toUnixTime,
} from '../../solana_dexes/clickhouse';
import { ClickhouseState } from '../../core/states/clickhouse_state';
import { SolanaLiquidityStream } from '../../streams/solana_liquidity';
import { HttpClient } from '@subsquid/http-client';

async function main() {
  const clickhouse = createClickhouseClient();
  const logger = createLogger('solana_liquidity');

  const ds = new SolanaLiquidityStream({
    portal: {
      url: 'https://portal.sqd.dev/datasets/solana-mainnet',
      http: new HttpClient({
        retryAttempts: 10,
      }),
    },
    args: {
      fromBlock: process.env.FROM_BLOCK ? parseInt(process.env.FROM_BLOCK) : 317617480,
      toBlock: process.env.TO_BLOCK ? parseInt(process.env.TO_BLOCK) : undefined,
      dbPath: './liquidity.db',
    },
    logger,
    state: new ClickhouseState(clickhouse, {
      table: 'solana_sync_status',
      id: 'solana_liquidity',
    }),
    onProgress: ({ state, interval }) => {
      logger.info({
        message: `${formatNumber(state.current)} / ${formatNumber(state.last)} (${formatNumber(state.percent)}%)`,
        speed: `${interval.processedPerSecond} blocks/second`,
      });
    },
    onStart: async ({ current, initial }) => {
      await cleanAllBeforeOffset(
        { clickhouse, logger },
        {
          table: ['solana_liquidity_transactions'],
          offset: current.number,
          column: 'block_number',
        },
      );

      if (initial.number === current.number) {
        logger.info(`Syncing from ${formatNumber(current.number)}`);
        return;
      }

      logger.info(`Resuming from ${formatNumber(current.number)}`);
    },
  });

  await ensureTables(clickhouse, path.join(__dirname, 'liquidity.sql'));

  const stream = await ds.stream();

  for await (const liquidityEvents of stream) {
    await clickhouse.insert({
      table: 'solana_liquidity_transactions',
      format: 'JSONEachRow',
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
          offset: liquidityEvent.offset,
          sign: 1,
        };
      }),
    });

    await ds.ack(liquidityEvents);
  }
}

void main();
