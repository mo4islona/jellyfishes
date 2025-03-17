import path from 'node:path';
import { ClickhouseState } from '../../../core/states/clickhouse_state';
import { createLogger, formatNumber } from '../../../examples/utils';
import { SolanaMintStream } from '../../../streams/solana_mint/solana_mint';
import { createClickhouseClient, ensureTables, toUnixTime } from '../../clickhouse';

async function main() {
  const clickhouse = createClickhouseClient();
  const logger = createLogger('solana_tokens');

  await ensureTables(clickhouse, path.join(__dirname, 'mints.sql'));

  const datasource = new SolanaMintStream({
    portal: 'https://portal.sqd.dev/datasets/solana-mainnet',
    blockRange: {
      from: 240_000_000,
    },
    logger,
    state: new ClickhouseState(clickhouse, {
      table: 'solana_sync_status',
      id: 'mint',
    }),
    onProgress: ({ state, interval }) => {
      logger.info({
        message: `${formatNumber(state.current)} / ${formatNumber(state.last)} (${formatNumber(state.percent)}%)`,
        speed: `${interval.processedPerSecond} blocks/second`,
      });
    },
  });

  for await (const mints of await datasource.stream()) {
    await clickhouse.insert({
      table: 'solana_tokens',
      values: mints.map((m) => ({
        account: m.account,
        decimals: m.decimals,
        mint_authority: m.mintAuthority,
        block_number: m.block.number,
        transaction_hash: m.transaction.hash,
        timestamp: toUnixTime(m.timestamp),
      })),
      format: 'JSONEachRow',
    });

    await datasource.ack();
  }
}

void main();
