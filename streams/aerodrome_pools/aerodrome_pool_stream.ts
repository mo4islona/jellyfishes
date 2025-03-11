import { AbstractStream, BlockRef, Offset } from '../../core/abstract_stream';
import { events as abiAerodrome } from './aerodrome';

export type AerodromePool = {
  pool: string;
  factoryAddress: string;
  tokenA: string;
  tokenB: string;

  block: BlockRef;
  transaction: {
    hash: string;
    index: number;
  };

  tickSpacing: number;

  timestamp: Date;
  offset: Offset;
};

export class AerodromePoolStream extends AbstractStream<
  {
    fromBlock: number;
  },
  AerodromePool
> {
  async stream(): Promise<ReadableStream<AerodromePool[]>> {
    const { args } = this.options;

    const offset = await this.getState({ number: args.fromBlock });

    const source = this.portal.getStream({
      type: 'evm',
      fromBlock: offset.number,
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
          topic0: [abiAerodrome.PoolCreated.topic],
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

            const offset = this.encodeOffset({
              number: block.header.number,
              hash: block.header.hash,
            });

            const res = block.logs
              .map((l): AerodromePool | null => {
                if (abiAerodrome.PoolCreated.is(l)) {
                  const data = abiAerodrome.PoolCreated.decode(l);

                  return {
                    pool: data.pool,
                    block: block.header,
                    factoryAddress: l.address,
                    tokenA: data.token0,
                    tokenB: data.token1,
                    tickSpacing: data.tickSpacing,
                    transaction: {
                      hash: l.transactionHash,
                      index: l.transactionIndex,
                    },
                    timestamp: new Date(block.header.timestamp * 1000),
                    offset,
                  };
                }

                return null;
              })
              .filter(Boolean);

            return res;
          });

          if (!events.length) return;

          controller.enqueue(events);
        },
      }),
    );
  }
}
