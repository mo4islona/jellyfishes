import { BlockRef, Offset, PortalAbstractStream } from '../../../core/portal_abstract_stream';

export type DexPoolTxData = {
  timestamp: Date;
  offset: Offset;
  block: BlockRef;
  transaction: {
    hash: string;
    index: number;
  };
};

export type DexPool = {
  factoryAddress: string;
} & DexPoolTxData;

export abstract class DexPoolStream<
  TDexPoolData,
  TDexPool extends DexPool,
> extends PortalAbstractStream<TDexPool> {
  // Abstract methods that child classes must implement
  protected abstract getLogFilters(): any[];
  protected abstract decodePoolFromEvent(log: any): TDexPoolData | null;

  async stream(): Promise<ReadableStream<TDexPool[]>> {
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
      logs: this.getLogFilters(),
    });

    return source.pipeThrough(
      new TransformStream({
        transform: ({ blocks }, controller) => {
          const events = blocks.flatMap((block: any) => {
            if (!block.logs) return [];

            const res = block.logs
              .map((log: any) => {
                const pool = this.decodePoolFromEvent(log);
                if (!pool) return null;

                return {
                  ...pool,
                  factoryAddress: log.address,
                  block: block.header,
                  transaction: {
                    hash: log.transactionHash,
                    index: log.transactionIndex,
                  },
                  timestamp: new Date(block.header.timestamp * 1000),
                };
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
