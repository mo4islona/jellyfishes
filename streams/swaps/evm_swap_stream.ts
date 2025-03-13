import { AbstractStream, BlockRange, BlockRef, Offset } from '../../core/abstract_stream';
import { events as UniswapV3SwapsEvents } from './uniswap.v3/swaps';
import { events as UniswapV3FactoryEvents } from './uniswap.v3/factory';
import { events as AerodromeFactoryEvents } from './aerodrome/factory';
import { events as AerodromeSwapEvents } from './aerodrome/swaps';
import { DatabaseSync, StatementSync } from 'node:sqlite';
import { uniq } from 'lodash';
import { Network } from '../../evm_dexes/config';
import { dexToLogs } from './dexs_to_logs';
import { PoolMetadataStorage } from './pool_metadata_storage';
import { handleUniswapV3Swap } from './handle_uniswap_v3_swap';
import { handleAerodromeBasicSwap } from './handle_aerodrome_basic_swap';
import { handleAerodromeSlipstreamSwap } from './handle_aerodrome_slipstream_swap';

export const DexNameValues = ['uniswap', 'aerodrome'] as const;
export const ProtocolValues = ['uniswap.v3', 'aerodrome_basic', 'aerodrome_slipstream'] as const;

export type Protocol = (typeof ProtocolValues)[number];
export type DexName = (typeof DexNameValues)[number];

export type TxInfo = {
  block: BlockRef;
  transaction: {
    hash: string;
    index: number;
    logIndex: number;
  };
  timestamp: Date;
  offset: Offset;
};

export type Dex = {
  dexName: DexName;
  protocol: Protocol;
};

export type EvmSwap = {
  dexName: DexName;
  protocol: Protocol;
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
  // liquidity: bigint;
  // tick: number;
  // sqrtPriceX96: bigint;
} & TxInfo;

type Args = {
  network: Network;
  block: BlockRange;
  //factoryContract?: string;
  dbPath: string;
  dexs: Dex[];
};

export class EvmSwapStream extends AbstractStream<Args, EvmSwap> {
  poolMetadataStorage: PoolMetadataStorage;

  initialize() {
    this.poolMetadataStorage = new PoolMetadataStorage(this.options.args.dbPath);
  }

  async stream(): Promise<ReadableStream<EvmSwap[]>> {
    const { args } = this.options;

    const logs = args.dexs.flatMap((dex) => dexToLogs(dex, args.network));

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
      logs,
    });

    return source.pipeThrough(
      new TransformStream({
        transform: ({ blocks }, controller) => {
          this.poolMetadataStorage.savePoolMetadataIntoDb(blocks, args.network);

          // FIXME
          const events = blocks
            .flatMap((block: any) => {
              if (!block.logs) return [];

              const offset = this.encodeOffset({
                number: block.header.number,
                hash: block.header.hash,
              });

              return block.logs.map((l) => {
                if (!block.transactions) return null;
                const transaction = block.transactions.find((t) => t.hash === l.transactionHash);
                if (!transaction) return null;

                const txInfo: TxInfo = {
                  block: block.header,
                  transaction: {
                    hash: l.transactionHash,
                    index: l.transactionIndex,
                    logIndex: l.logIndex,
                  },
                  timestamp: new Date(block.header.timestamp * 1000),
                  offset,
                };

                if (UniswapV3SwapsEvents.Swap.is(l)) {
                  return handleUniswapV3Swap(l, transaction, txInfo, this.poolMetadataStorage);
                }

                if (AerodromeSwapEvents.BasicPoolSwap.is(l)) {
                  return handleAerodromeBasicSwap(l, transaction, txInfo, this.poolMetadataStorage);
                }

                if (AerodromeSwapEvents.SlipstreamPoolSwap.is(l)) {
                  return handleAerodromeSlipstreamSwap(
                    l,
                    transaction,
                    txInfo,
                    this.poolMetadataStorage,
                  );
                }

                return null;
              });
            })
            .filter(Boolean);

          if (!events.length) return;

          controller.enqueue(events);
        },
      }),
    );
  }
}
