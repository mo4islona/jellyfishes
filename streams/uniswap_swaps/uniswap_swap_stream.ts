import { AbstractStream, BlockRange, BlockRef, Offset } from '../../core/abstract_stream';
import { events as swapsEvents } from './swaps';
import { events as factoryEvents } from './factory';
import { DatabaseSync, StatementSync } from 'node:sqlite';
import { uniq } from 'lodash';

type PoolMetadata = { pool: string; token_a: string; token_b: string; factory_address: string };

export type UniswapSwap = {
  account: string;
  tokenA: {
    amount: bigint;
    address?: string;
    sender: string;
  };
  tokenB: {
    amount: bigint;
    address?: string;
    recipient: string;
  };
  pool: {
    address: string;
  };
  factory: {
    address: string;
  };
  liquidity: bigint;
  tick: number;
  sqrtPriceX96: bigint;
  block: BlockRef;
  transaction: {
    hash: string;
    index: number;
    logIndex: number;
  };
  timestamp: Date;
  offset: Offset;
};

type Args = {
  block: BlockRange;
  factoryContract?: string;
  dbPath?: string;
};

export class UniswapSwapStream extends AbstractStream<Args, UniswapSwap> {
  db: DatabaseSync;
  statements: Record<string, StatementSync>;

  initialize() {
    if (!this.options.args.dbPath) return;

    this.db = new DatabaseSync(this.options.args.dbPath);
    // this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS "uniswap_pools" (pool TEXT PRIMARY KEY, token_a TEXT, token_b TEXT, factory_address TEXT)',
    );
    this.statements = {
      insert: this.db.prepare(
        'INSERT OR IGNORE INTO "uniswap_pools" VALUES (:pool, :token_a, :token_b, :factory_address)',
      ),
    };
  }

  async stream(): Promise<ReadableStream<UniswapSwap[]>> {
    const {args} = this.options;

    const source = await this.getStream({
      type: 'evm',
      fromBlock: args.block.from,
      toBlock: args.block.to,
      fields: {
        block: {
          number: true,
          hash: true,
          timestamp: true,
        },
        transaction: {
          from: true,
          to: true,
          hash: true,
        },
        log: {
          address: true,
          topics: true,
          data: true,
          transactionHash: true,
          logIndex: true,
          transactionIndex: true,
        },
      },
      logs: [
        {
          address: [args.factoryContract],
          topic0: [factoryEvents.PoolCreated.topic],
        },
        {
          topic0: [swapsEvents.Swap.topic],
          transaction: true,
        },
      ],
    });

    return source.pipeThrough(
      new TransformStream({
        transform: ({blocks}, controller) => {
          this.savePoolMetadata(blocks);

          // FIXME
          const events = blocks
            .flatMap((block: any) => {
              if (!block.logs) return [];

              const offset = this.encodeOffset({
                number: block.header.number,
                hash: block.header.hash,
              });

              const logs = block.logs.filter((l) => swapsEvents.Swap.is(l));
              const metadata = this.getPoolMetadata(logs);

              return logs.map((l): UniswapSwap | null => {
                const transaction = block.transactions.find((t) => t.hash === l.transactionHash);

                const poolMetadata = metadata[l.address];
                if (this.options.args.dbPath && !poolMetadata) return null;

                const data = swapsEvents.Swap.decode(l);

                return {
                  account: transaction.from,
                  tokenA: {
                    address: poolMetadata?.token_a,
                    amount: data.amount0,
                    sender: data.sender,
                  },
                  tokenB: {
                    address: poolMetadata?.token_b,
                    amount: data.amount1,
                    recipient: data.recipient,
                  },
                  factory: {
                    address: poolMetadata?.factory_address,
                  },
                  pool: {
                    address: l.address,
                  },

                  liquidity: data.liquidity,
                  tick: data.tick,
                  sqrtPriceX96: data.sqrtPriceX96,

                  block: block.header,
                  transaction: {
                    hash: l.transactionHash,
                    index: l.transactionIndex,
                    logIndex: l.logIndex,
                  },
                  timestamp: new Date(block.header.timestamp * 1000),
                  offset,
                };
              });
            })
            .filter(Boolean);

          if (!events.length) return;

          controller.enqueue(events);
        },
      }),
    );
  }

  savePoolMetadata(blocks: any[]) {
    if (!this.options.args.dbPath) return;

    const pools = blocks.flatMap((block: any) => {
      if (!block.logs) return [];

      return block.logs
        .filter((l) => factoryEvents.PoolCreated.is(l))
        .map((l): PoolMetadata => {
          const data = factoryEvents.PoolCreated.decode(l);

          return {
            pool: data.pool,
            token_a: data.token0,
            token_b: data.token1,
            factory_address: l.address,
          };
        });
    });

    if (!pools.length) return;

    // FIXME batch?
    for (const pool of pools) {
      this.statements.insert.run(pool);
    }
  }

  getPoolMetadata(logs: { address: string }[]): Record<string, PoolMetadata> {
    if (!this.options.args.dbPath) return {};

    const pools = uniq(logs.map((l) => l.address));
    if (!pools.length) return {};

    const params = new Array(pools.length).fill('?').join(',');
    const select = this.db.prepare(`
        SELECT *
        FROM "uniswap_pools"
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
