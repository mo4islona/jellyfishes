import { DatabaseSync, StatementSync } from 'node:sqlite';
import { DexName } from './evm_swap_stream';
import { Protocol } from './evm_swap_stream';
import { Network } from 'evm_dexes/config';
import { uniq } from 'lodash';

import { events as UniswapV3SwapsEvents } from './uniswap.v3/swaps';
import { events as UniswapV2FactoryEvents } from './uniswap.v2/factory';
import { events as UniswapV3FactoryEvents } from './uniswap.v3/factory';
import { events as AerodromeFactoryEvents } from './aerodrome/factory';
import { events as AerodromeSwapEvents } from './aerodrome/swaps';

export type PoolMetadata = {
  network: Network;
  dex_name: DexName;
  protocol: Protocol;
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

  constructor(private readonly dbPath: string) {
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

  setPoolMetadata(pool: string, metadata: PoolMetadata) {
    this.poolMetadataMap.set(pool, metadata);
  }

  savePoolMetadataIntoDb(blocks: any[], network: Network) {
    const pools = blocks
      .flatMap((block: any) => {
        if (!block.logs) return [];

        return block.logs.map((l): PoolMetadata | null => {
          if (UniswapV2FactoryEvents.PairCreated.is(l)) {
            const data = UniswapV2FactoryEvents.PairCreated.decode(l);
            return {
              network,
              pool: data.pair,
              token_a: data.token0,
              token_b: data.token1,
              factory_address: l.address,
              dex_name: 'uniswap',
              protocol: 'uniswap.v2',
              block_number: block.header.number,
            } satisfies PoolMetadata;
          }

          if (UniswapV3FactoryEvents.PoolCreated.is(l)) {
            const data = UniswapV3FactoryEvents.PoolCreated.decode(l);
            return {
              network,
              pool: data.pool,
              token_a: data.token0,
              token_b: data.token1,
              factory_address: l.address,
              dex_name: 'uniswap',
              protocol: 'uniswap.v3',
              block_number: block.header.number,
            } satisfies PoolMetadata;
          }

          if (AerodromeFactoryEvents.BasicPoolCreated.is(l)) {
            const data = AerodromeFactoryEvents.BasicPoolCreated.decode(l);
            return {
              network,
              pool: data.pool,
              token_a: data.token0,
              token_b: data.token1,
              factory_address: l.address,
              dex_name: 'aerodrome',
              protocol: 'aerodrome_basic',
              block_number: block.header.number,
            } satisfies PoolMetadata;
          }

          if (AerodromeFactoryEvents.CLFactoryPoolCreated.is(l)) {
            const data = AerodromeFactoryEvents.CLFactoryPoolCreated.decode(l);
            return {
              network,
              pool: data.pool,
              token_a: data.token0,
              token_b: data.token1,
              factory_address: l.address,
              dex_name: 'aerodrome',
              protocol: 'aerodrome_slipstream',
              block_number: block.header.number,
            } satisfies PoolMetadata;
          }
          return null;
        });
      })
      .filter(Boolean);

    if (!pools.length) return;

    // FIXME batch?
    for (const pool of pools) {
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
        WHERE "pool" IN (${params})
    `);

    const poolsMetadata = select.all(...pools) as PoolMetadata[];

    return poolsMetadata.reduce(
      (res, pool) => ({
        ...res,
        [pool.pool]: pool,
      }),
      {},
    );
  }
}
