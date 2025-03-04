import { AbstractStream, BlockRef, Offset } from '../../core/abstract_stream';
import { events as abi_events } from './abi';

export type UniswapSwap = {
  sender: string;
  recipient: string;
  pool: string;
  liquidity: bigint;
  tick: number;
  amount0: bigint;
  amount1: bigint;
  sqrtPriceX96: bigint;
  block: BlockRef;
  transaction: {
    hash: string;
    index: number;
  };
  timestamp: Date;
  offset: Offset;
};

export class UniswapSwapStream extends AbstractStream<
  {
    fromBlock: number;
  },
  UniswapSwap
> {
  async stream(): Promise<ReadableStream<UniswapSwap[]>> {
    const {args} = this.options;

    const offset = await this.getState({number: args.fromBlock, hash: ''});

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
          topic0: [abi_events.Swap.topic],
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
              .filter((l) => abi_events.Swap.is(l))
              .map((l): UniswapSwap => {
                const data = abi_events.Swap.decode(l);

                return {
                  sender: data.sender,
                  recipient: data.recipient,
                  liquidity: data.liquidity,
                  tick: data.tick,
                  amount0: data.amount0,
                  amount1: data.amount1,
                  sqrtPriceX96: data.sqrtPriceX96,
                  pool: l.address,
                  block: block.header,
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
