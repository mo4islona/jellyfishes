import { AbstractStream, BlockRef, Offset } from '../../core/abstract_stream';
import { events as abi_events } from './abi';

export type Erc20Event = {
  from: string;
  to: string;
  amount: bigint;
  token_address: string;
  block: BlockRef;
  tx: string;
  timestamp: Date;
  offset: Offset;
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
    const {args} = this.options;

    const offset = await this.getState({
      number: args.fromBlock,
      hash: '',
    });

    this.logger.debug(`starting from block ${offset.number}`);

    const source = this.portal.getFinalizedStream({
      type: 'evm',
      fromBlock: offset.number,
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
        transform: ({blocks}, controller) => {
          // FIXME any
          const events = blocks.flatMap((block: any) => {
            if (!block.logs) return [];

            const offset = this.encodeOffset({
              number: block.header.number,
              hash: block.header.hash,
            });

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
