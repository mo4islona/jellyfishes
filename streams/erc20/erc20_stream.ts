import { AbstractStream, BlockRef } from '../../core/abstract_stream';
import { events as abi_events } from './abi';

export type Erc20Event = {
  from: string;
  to: string;
  amount: bigint;
  token_address: string;
  block: BlockRef;
  tx: string;
  timestamp: Date;
};

export class Erc20Stream extends AbstractStream<
  {
    fromBlock: number;
    toBlock?: number;
    contracts: string[];
  },
  Erc20Event
> {
  async stream(): Promise<ReadableStream<Erc20Event[]>> {
    const { args } = this.options;

    const source = await this.getStream({
      type: 'evm',
      fromBlock: args.fromBlock,
      toBlock: args.toBlock,
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
          address: this.options.args.contracts,
          topic0: [abi_events.Transfer.topic],
        },
      ],
    });

    return source.pipeThrough(
      new TransformStream({
        transform: async ({ blocks }, controller) => {
          // FIXME any
          const events = blocks.flatMap((block: any) => {
            if (!block.logs) return [];

            return block.logs
              .filter((l: any) => abi_events.Transfer.is(l))
              .map((l: any): Erc20Event => {
                const data = abi_events.Transfer.decode(l);

                return {
                  from: data.from,
                  to: data.to,
                  amount: data.value,
                  token_address: l.address,
                  block: block.header,
                  timestamp: new Date(block.header.timestamp * 1000),
                  tx: l.transactionHash,
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
