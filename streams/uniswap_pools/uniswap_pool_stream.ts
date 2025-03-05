import { AbstractStream, BlockRef, Offset } from '../../core/abstract_stream';
import { events as abi } from './abi';

export const FACTORY_ADDRESS = '0x1f98431c8ad98523631ae4a59f267346ea31f984';
export const FACTORY_DEPLOYED_AT = 12369621;

export type UniswapPool = {
  pool: string;
  factoryAddress: string;
  tokenA: string;
  tokenB: string;
  fee: number;
  tickSpacing: number;
  block: BlockRef;
  transaction: {
    hash: string;
    index: number;
  };
  timestamp: Date;
  offset: Offset;
};

export class UniswapPoolStream extends AbstractStream<
  {
    fromBlock: number;
  },
  UniswapPool
> {
  async stream(): Promise<ReadableStream<UniswapPool[]>> {
    const {args} = this.options;

    const offset = await this.getState({number: args.fromBlock || FACTORY_DEPLOYED_AT, hash: ''});

    const source = this.portal.getFinalizedStream({
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
          topic0: [abi.PoolCreated.topic],
          transaction: true,
        },
      ],
    });

    return source.pipeThrough(
      new TransformStream({
        transform: ({blocks}, controller) => {
          // FIXME
          const events = blocks.flatMap((block: any) => {
            if (!block.logs) return [];

            const offset = this.encodeOffset({
              number: block.header.number,
              hash: block.header.hash,
            });

            return block.logs
              .filter((l) => abi.PoolCreated.is(l))
              .map((l): UniswapPool => {
                const data = abi.PoolCreated.decode(l);

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
                  offset,
                };
              });
          });

          if (!events.length) return;

          controller.enqueue(events);
        },
      }),
    );
  }
}
