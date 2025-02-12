import path from 'node:path';
import { PortalClient } from '@subsquid/portal-client';
import { ClickhouseProgress } from '../../core/states/clickhouse_progress';
import { TrackProgress } from '../../core/track_progress';
import { createLogger, formatNumber, last } from '../../examples/utils';
import { SolanaMintStream } from '../../streams/solana_mint/solana_mint';
import { createClickhouseClient, ensureTables, toUnixTime } from '../clickhouse';

async function main() {
  const portal = new PortalClient({
    url: 'https://portal.sqd.dev/datasets/solana-mainnet',
  });

  const clickhouse = createClickhouseClient();
  const logger = createLogger('solana_tokens');

  await ensureTables(clickhouse, path.join(__dirname, 'mints.sql'));

  const progress = new TrackProgress({
    portal,
    onProgress: ({blocks, interval}) => {
      logger.info({
        message: `${formatNumber(blocks.current)} / ${formatNumber(blocks.head)} (${formatNumber(blocks.percent_done)}%)`,
        speed: interval.speed,
      });
    },
  });

  const datasource = new SolanaMintStream({
    portal,
    args: {
      fromBlock: 240_000_000,
    },
    progress: new ClickhouseProgress(clickhouse, {
      table: 'solana_dex_status',
      id: 'mint',
    }),
    logger,
  });

  for await (const mints of await datasource.stream()) {
    await clickhouse.insert({
      table: 'solana_tokens',
      values: mints.map((m) => ({
        account: m.account,
        decimals: m.decimals,
        mint_authority: m.mintAuthority,
        block_number: m.block.number,
        tx: m.transaction.id,
        timestamp: toUnixTime(m.timestamp),
      })),
      format: 'JSONEachRow',
    });

    await datasource.ack(mints);

    const block = last(mints).block;
    progress.track(block);
  }
}

void main();
