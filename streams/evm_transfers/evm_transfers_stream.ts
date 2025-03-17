import { BlockRef, OptionalArgs, PortalAbstractStream } from '../../core/portal_abstract_stream';
import { events as abi_events } from './abi';

export type Erc20Event = {
  from: string;
  to: string;
  amount: bigint;
  token_address: string;
  block: BlockRef;
  tx: string;
  transaction: {
    hash: string;
    index: number;
    logIndex: number;
  };
  timestamp: Date;
};

export class EvmTransfersStream extends PortalAbstractStream<
  Erc20Event,
  OptionalArgs<{
    contracts?: string[];
  }>
> {
  async stream(): Promise<ReadableStream<Erc20Event[]>> {
    const source = await this.getStream({
      type: 'evm',
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
          address: this.options.args?.contracts,
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
                  transaction: {
                    hash: l.transactionHash,
                    index: l.transactionIndex,
                    logIndex: l.logIndex,
                  },
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
