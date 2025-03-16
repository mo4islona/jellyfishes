import { DatabaseSync, StatementSync } from 'node:sqlite';
import { uniq } from 'lodash';
import { DexName, DexProtocol } from './evm_swap_stream';
import { Network } from './networks';

export type PoolMetadata = {
  network: Network;
  dex_name: DexName;
  protocol: DexProtocol;
  pool: string;
  token_a: string;
  token_b: string;
  factory_address: string;
  block_number: number;
};

export class PoolMetadataStorage {
  db: DatabaseSync;
  statements: Record<string, StatementSync>;
  poolMetadataMap: Map<string, PoolMetadata>;

  constructor(
    private readonly dbPath: string,
    public readonly network: Network,
  ) {
    this.db = new DatabaseSync(this.dbPath);
    // this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS "evm_pools" (network TEXT, dex_name TEXT, protocol TEXT, pool TEXT, token_a TEXT, token_b TEXT, factory_address TEXT, block_number INTEGER, PRIMARY KEY (network, pool))',
    );
    this.statements = {
      insert: this.db.prepare(
        'INSERT OR IGNORE INTO "evm_pools" VALUES (:network, :dex_name, :protocol, :pool, :token_a, :token_b, :factory_address, :block_number)',
      ),
    };
    this.poolMetadataMap = new Map();
  }

  // FIXME rewrite for batch fetch
  getPoolMetadata(pool: string): PoolMetadata | undefined {
    let poolMetadata = this.poolMetadataMap.get(pool);
    if (!poolMetadata) {
      const metadata = this.getPoolMetadataFromDb([{ address: pool }]);
      poolMetadata = metadata[pool];

      if (poolMetadata) {
        this.poolMetadataMap.set(pool, poolMetadata);
      } else {
        return undefined;
      }
    }

    return poolMetadata;
  }

  savePoolMetadataIntoDb(poolMetadata: PoolMetadata[]) {
    for (const pool of poolMetadata) {
      this.statements.insert.run(pool);
      this.poolMetadataMap.set(pool.pool, pool);
    }
  }

  getPoolMetadataFromDb(logs: { address: string }[]): Record<string, PoolMetadata> {
    const pools = uniq(logs.map((l) => l.address));
    if (!pools.length) return {};

    const params = new Array(pools.length).fill('?').join(',');
    const select = this.db.prepare(`
        SELECT *
        FROM "evm_pools"
        WHERE "network" = ? AND "pool" IN (${params})
    `);

    const poolsMetadata = select.all(this.network, ...pools) as PoolMetadata[];

    return poolsMetadata.reduce(
      (res, pool) => ({
        ...res,
        [pool.pool]: pool,
      }),
      {},
    );
  }
}
