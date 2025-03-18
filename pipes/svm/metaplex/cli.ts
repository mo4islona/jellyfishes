import path from 'node:path';
import { ClickhouseState } from '../../../core/states/clickhouse_state';
import { createLogger, formatNumber } from '../../../examples/utils';
import { SolanaTokenMetadataStream } from '../../../streams/solana_metaplex/solana_metaplex';
import { createClickhouseClient, ensureTables, toUnixTime } from '../../clickhouse';

async function main() {
  const clickhouse = createClickhouseClient();
  const logger = createLogger('solana_metaplex');

  await ensureTables(clickhouse, path.join(__dirname, 'metaplex.sql'));

  const datasource = new SolanaTokenMetadataStream({
    portal: 'https://portal.sqd.dev/datasets/solana-mainnet',
    blockRange: {
      from: 240_000_000,
    },
    logger,
    state: new ClickhouseState(clickhouse, {
      table: 'solana_sync_status',
      id: 'metaplex',
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
      table: 'solana_metaplex',
      values: mints.map((m) => ({
        account: m.account,
        mint: m.mint,
        name: m.name,
        symbol: m.symbol,
        uri: m.uri,
        is_mutable: m.isMutable,
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
