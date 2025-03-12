import { AbstractStream, BlockRef } from '../../core/abstract_stream';
import { events as abiUniswapV3 } from './uniswap';
import { events as abiAlgebraV1 } from './algebra';

export type UniswapPool = {
  pool: string;
  factoryAddress: string;
  tokenA: string;
  tokenB: string;

  block: BlockRef;
  transaction: {
    hash: string;
    index: number;
  };

  fee?: number;
  tickSpacing?: number;

  timestamp: Date;
};

export class UniswapPoolStream extends AbstractStream<
  {
    fromBlock: number;
  },
  UniswapPool
> {
  async stream(): Promise<ReadableStream<UniswapPool[]>> {
    const { args } = this.options;

    const source = await this.getStream({
      type: 'evm',
      fromBlock: args.fromBlock,
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
          topic0: [abiUniswapV3.PoolCreated.topic, abiAlgebraV1.Pool.topic],
          transaction: true,
        },
      ],
    });

    return source.pipeThrough(
      new TransformStream({
        transform: ({ blocks }, controller) => {
          // FIXME
          const events = blocks.flatMap((block: any) => {
            if (!block.logs) return [];

            return block.logs
              .map((l): UniswapPool | null => {
                if (abiAlgebraV1.Pool.is(l)) {
                  const data = abiAlgebraV1.Pool.decode(l);
                  return {
                    pool: data.pool,
                    block: block.header,
                    factoryAddress: l.address,
                    tokenA: data.token0,
                    tokenB: data.token1,
                    transaction: {
                      hash: l.transactionHash,
                      index: l.transactionIndex,
                    },
                    timestamp: new Date(block.header.timestamp * 1000),
                  };
                } else if (abiUniswapV3.PoolCreated.is(l)) {
                  const data = abiUniswapV3.PoolCreated.decode(l);

                  return {
                    pool: data.pool,
                    block: block.header,
                    factoryAddress: l.address,
                    tokenA: data.token0,
                    tokenB: data.token1,
                    tickSpacing: data.tickSpacing,
                    fee: data.fee,
                    transaction: {
                      hash: l.transactionHash,
                      index: l.transactionIndex,
                    },
                    timestamp: new Date(block.header.timestamp * 1000),
                  };
                }

                return null;
              })
              .filter(Boolean);
          });

          if (!events.length) return;

          controller.enqueue(events);
        },
      }),
    );
  }
}
