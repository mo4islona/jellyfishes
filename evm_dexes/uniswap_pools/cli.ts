import { UniswapPoolStream } from '../../streams/uniswap_pools/uniswap_pool_stream';
import { getConfig } from '../config';
import { DexPoolCli, DexPoolCliConfig } from '../common/dex_pool_cli';

class UniswapPoolCli extends DexPoolCli {
  constructor(config: DexPoolCliConfig) {
    super(config, 'uniswap.v3');
  }

  async run(): Promise<void> {
    await this.initialize();

    const ds = new UniswapPoolStream(this.createStreamOptions('uniswap_sync_status'));

    this.db.exec(
      'CREATE TABLE IF NOT EXISTS uniswap_pools (pool TEXT PRIMARY KEY, token_a TEXT, token_b TEXT, factory_address TEXT)',
    );

    const insert = this.db.prepare('INSERT OR IGNORE INTO uniswap_pools VALUES (?, ?, ?, ?)');

    for await (const pools of await ds.stream()) {
      // TODO Do we need batch insert here? On local laptop with fast SSD is 50-100ms
      for await (const pool of pools) {
        insert.run(pool.pool, pool.tokenA, pool.tokenB, pool.factoryAddress);
      }

      await ds.ack(pools);
    }
  }
}

async function main() {
  const config = getConfig();
  const cli = new UniswapPoolCli(config);
  await cli.run();
}

void main();
