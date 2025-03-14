import { AerodromePoolStream } from '../../streams/aerodrome_pools/aerodrome_pool_stream';
import { getConfig } from '../config';
import { DexPoolCli, DexPoolCliConfig } from '../common/dex_pool_cli';

class AerodromePoolCli extends DexPoolCli {
  constructor(config: DexPoolCliConfig) {
    super(config, 'aerodrome');
  }

  async run(): Promise<void> {
    await this.initialize();

    const ds = new AerodromePoolStream(this.createStreamOptions('aerodrome_sync_status'));

    this.db.exec(
      'CREATE TABLE IF NOT EXISTS aerodrome_pools (pool TEXT PRIMARY KEY, token_a TEXT, token_b TEXT, tick_spacing INTEGER, factory_address TEXT)',
    );

    const insert = this.db.prepare('INSERT OR IGNORE INTO aerodrome_pools VALUES (?, ?, ?, ?, ?)');

    for await (const pools of await ds.stream()) {
      // TODO Do we need batch insert here? On local laptop with fast SSD is 50-100ms
      for await (const pool of pools) {
        insert.run(pool.pool, pool.tokenA, pool.tokenB, pool.tickSpacing, pool.factoryAddress);
      }

      await ds.ack(pools);
    }
  }
}

async function main() {
  const config = getConfig();
  const cli = new AerodromePoolCli(config);
  await cli.run();
}

void main();
