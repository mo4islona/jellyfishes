import { AbstractStream, BlockRange, BlockRef, Offset } from '../../core/abstract_stream';
import { events as UniswapV3SwapsEvents } from './uniswap.v3/swaps';
import { events as UniswapV2SwapsEvents } from './uniswap.v2/swaps';
import { events as AerodromeSwapEvents } from './aerodrome/swaps';
import { Network } from '../../evm_dexes/config';
import { dexToLogs } from './dexs_to_logs';
import { PoolMetadataStorage } from './pool_metadata_storage';
import { handleUniswapV3Swap } from './handle_uniswap_v3_swap';
import { handleAerodromeBasicSwap } from './handle_aerodrome_basic_swap';
import { handleAerodromeSlipstreamSwap } from './handle_aerodrome_slipstream_swap';
import { handleUniswapV2Swap } from './handle_uniswap_v2_swap';
import { PoolMetadata } from './pool_metadata_storage';
import { events as UniswapV2FactoryEvents } from './uniswap.v2/factory';
import { events as UniswapV3FactoryEvents } from './uniswap.v3/factory';
import { events as AerodromeFactoryEvents } from './aerodrome/factory';

export const DexNameValues = ['uniswap', 'aerodrome'] as const;
export const ProtocolValues = [
  'uniswap.v3',
  'uniswap.v2',
  'aerodrome_basic',
  'aerodrome_slipstream',
] as const;

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
  includeSwaps?: boolean;
  dbPath: string;
  dexs: Dex[];
  poolMetadataStorage: PoolMetadataStorage;
};

type EvmSwapOrPoolMetadata = EvmSwap | PoolMetadata;

export class EvmSwapStream extends AbstractStream<Args, EvmSwapOrPoolMetadata> {
  initialize() {}

  async stream(): Promise<ReadableStream<EvmSwapOrPoolMetadata[]>> {
    const { args } = this.options;
    const logs = args.dexs.flatMap((dex) => dexToLogs(dex, args.network, args.includeSwaps));

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
          const events = blocks
            .flatMap((block: any) => {
              if (!block.logs || !block.transactions) return [];

              const offset = this.encodeOffset({
                number: block.header.number,
                hash: block.header.hash,
                timestamp: block.header.timestamp,
              });

              const blockEvents = block.logs.map((l) => {
                const transaction = block.transactions.find(
                  (t) => t.hash.toLowerCase() === l.transactionHash.toLowerCase(),
                );
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

                let poolMetadata: PoolMetadata | null = null;

                if (UniswapV2FactoryEvents.PairCreated.is(l)) {
                  const data = UniswapV2FactoryEvents.PairCreated.decode(l);
                  poolMetadata = {
                    network: args.network,
                    pool: data.pair,
                    token_a: data.token0,
                    token_b: data.token1,
                    factory_address: l.address,
                    dex_name: 'uniswap',
                    protocol: 'uniswap.v2',
                    block_number: block.header.number,
                    offset,
                  } satisfies PoolMetadata;
                } else if (UniswapV3FactoryEvents.PoolCreated.is(l)) {
                  const data = UniswapV3FactoryEvents.PoolCreated.decode(l);
                  poolMetadata = {
                    network: args.network,
                    pool: data.pool,
                    token_a: data.token0,
                    token_b: data.token1,
                    factory_address: l.address,
                    dex_name: 'uniswap',
                    protocol: 'uniswap.v3',
                    block_number: block.header.number,
                    offset,
                  } satisfies PoolMetadata;
                } else if (AerodromeFactoryEvents.BasicPoolCreated.is(l)) {
                  const data = AerodromeFactoryEvents.BasicPoolCreated.decode(l);
                  poolMetadata = {
                    network: args.network,
                    pool: data.pool,
                    token_a: data.token0,
                    token_b: data.token1,
                    factory_address: l.address,
                    dex_name: 'aerodrome',
                    protocol: 'aerodrome_basic',
                    block_number: block.header.number,
                    offset,
                  } satisfies PoolMetadata;
                } else if (AerodromeFactoryEvents.CLFactoryPoolCreated.is(l)) {
                  const data = AerodromeFactoryEvents.CLFactoryPoolCreated.decode(l);
                  poolMetadata = {
                    network: args.network,
                    pool: data.pool,
                    token_a: data.token0,
                    token_b: data.token1,
                    factory_address: l.address,
                    dex_name: 'aerodrome',
                    protocol: 'aerodrome_slipstream',
                    block_number: block.header.number,
                    offset,
                  } satisfies PoolMetadata;
                }

                if (poolMetadata) {
                  args.poolMetadataStorage.savePoolMetadataIntoDb([poolMetadata]);
                  args.poolMetadataStorage.setPoolMetadata(poolMetadata.pool, poolMetadata);
                  return poolMetadata;
                }

                if (!args.includeSwaps) {
                  return null;
                }

                if (UniswapV2SwapsEvents.Swap.is(l)) {
                  return handleUniswapV2Swap(l, transaction, txInfo, args.poolMetadataStorage);
                }

                if (UniswapV3SwapsEvents.Swap.is(l)) {
                  return handleUniswapV3Swap(l, transaction, txInfo, args.poolMetadataStorage);
                }

                if (AerodromeSwapEvents.BasicPoolSwap.is(l)) {
                  return handleAerodromeBasicSwap(l, transaction, txInfo, args.poolMetadataStorage);
                }

                if (AerodromeSwapEvents.SlipstreamPoolSwap.is(l)) {
                  return handleAerodromeSlipstreamSwap(
                    l,
                    transaction,
                    txInfo,
                    args.poolMetadataStorage,
                  );
                }

                return null;
              });
              return blockEvents;
            })
            .filter(Boolean);

          if (!events.length) return;

          controller.enqueue(events);
        },
      }),
    );
  }
}
