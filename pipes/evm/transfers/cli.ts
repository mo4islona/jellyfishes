import path from 'node:path';
import { ClickhouseState } from '../../../core/states/clickhouse_state';
import { EvmTransfersStream } from '../../../streams/evm_transfers/evm_transfers_stream';
import { createClickhouseClient, ensureTables, toUnixTime } from '../../clickhouse';
import { createLogger, formatNumber } from '../../utils';
import { getConfig } from '../config';

const config = getConfig();

const clickhouse = createClickhouseClient();
const logger = createLogger('erc20').child({ network: config.network });

async function main() {
  const ds = new EvmTransfersStream({
    portal: config.portal.url,
    blockRange: {
      from: 0,
    },
    logger,
    state: new ClickhouseState(clickhouse, {
      table: 'evm_sync_status',
      id: `erc20-transfers-${config.network}-v2`,
      onStateRollback: async (state, current) => {
        /**
         * Clean all data before the current offset.
         * There is a small chance if the stream is interrupted, the data will be duplicated.
         * We just clean it up at the start to avoid duplicates.
         */
        await state.cleanAllBeforeOffset({
          table: 'evm_erc20_transfers',
          column: 'timestamp',
          offset: current.timestamp,
          filter: `network = '${config.network}'`,
        });
      },
    }),
  });

  await ensureTables(clickhouse, path.join(__dirname, 'erc20_transfers.sql'));

  for await (const transfers of await ds.stream()) {
    await clickhouse.insert({
      table: 'evm_erc20_transfers',
      values: transfers.map((t) => {
        return {
          network: config.network,
          block_number: t.block.number,
          transaction_hash: t.transaction.hash,
          transaction_index: t.transaction.index,
          log_index: t.transaction.logIndex,
          token: t.token_address,
          from: t.from,
          to: t.to,
          amount: t.amount.toString(),
          timestamp: toUnixTime(t.timestamp),
          sign: 1,
        };
      }),
      format: 'JSONEachRow',
    });

    await ds.ack();
  }
}

void main();
