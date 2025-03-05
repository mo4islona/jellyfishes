import { createLogger, formatNumber } from '../../examples/utils';
import path from 'node:path';
import {
  cleanAllBeforeOffset,
  createClickhouseClient,
  ensureTables,
  toUnixTime,
} from '../../solana_dexes/clickhouse';
import { ClickhouseState } from '../../core/states/clickhouse_state';
import { InitializeLiquidity } from '../../streams/solana_liquidity/handlers/base_handler';
import { SolanaLiquidityStream } from '../../streams/solana_liquidity';

async function main() {
  const clickhouse = createClickhouseClient();
  const logger = createLogger('solana_liquidity');

  const ds = new SolanaLiquidityStream({
    portal: 'https://portal.sqd.dev/datasets/solana-mainnet',
    args: {
      fromBlock: process.env.FROM_BLOCK ? parseInt(process.env.FROM_BLOCK) : 240_000_000,
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
          table: ['solana_liquidity_transactions', 'solana_pools'],
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
    const bootstrapLiquidityEvents = liquidityEvents.filter(
      (liquidityEvent): liquidityEvent is InitializeLiquidity =>
        liquidityEvent.eventType === 'initialize',
    );

    if (bootstrapLiquidityEvents.length) {
      await clickhouse.insert({
        table: 'solana_pools',
        format: 'JSONEachRow',
        values: bootstrapLiquidityEvents.map((liquidityEvent) => {
          return {
            pool_id: liquidityEvent.lpMint,
            token_a: liquidityEvent.tokenAMint,
            token_b: liquidityEvent.tokenBMint,
            protocol: liquidityEvent.protocol,
            pool_type: liquidityEvent.poolType,
            block_number: liquidityEvent.blockNumber,
            sign: 1,
          };
        }),
      });
    }

    await clickhouse.insert({
      table: 'solana_liquidity_transactions',
      format: 'JSONEachRow',
      values: liquidityEvents.map((liquidityEvent) => {
        return {
          lp_mint: liquidityEvent.lpMint,
          protocol: liquidityEvent.protocol,
          pool_type: liquidityEvent.poolType,
          timestamp: toUnixTime(liquidityEvent.timestamp),
          event_type: liquidityEvent.eventType,
          amount_token_a: Number(liquidityEvent.tokenAAmount),
          amount_token_b: Number(liquidityEvent.tokenBAmount),
          sender: liquidityEvent.sender,
          block_number: liquidityEvent.blockNumber,
          transaction_hash: liquidityEvent.transactionHash,
          transaction_index: liquidityEvent.transactionIndex,
          instruction: liquidityEvent.instruction,
          sign: 1,
        };
      }),
    });

    await ds.ack(liquidityEvents);
  }
}

void main();
