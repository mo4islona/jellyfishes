import { AbstractStream, BlockRange, BlockRef } from '../../core/abstract_stream';
import { events as UniswapV3SwapsEvents } from './uniswap.v3/swaps';
import { events as UniswapV2SwapsEvents } from './uniswap.v2/swaps';
import { events as AerodromeSwapEvents } from './aerodrome/swaps';
import { PoolMetadata, PoolMetadataStorage } from './pool_metadata_storage';
import { handleUniswapV3Swap } from './handle_uniswap_v3_swap';
import { handleAerodromeBasicSwap } from './handle_aerodrome_basic_swap';
import { handleAerodromeSlipstreamSwap } from './handle_aerodrome_slipstream_swap';
import { handleUniswapV2Swap } from './handle_uniswap_v2_swap';
import { events as UniswapV2FactoryEvents } from './uniswap.v2/factory';
import { events as UniswapV3FactoryEvents } from './uniswap.v3/factory';
import { events as AerodromeFactoryEvents } from './aerodrome/factory';
import { Network, NetworksMappings } from './networks';
import { nonNullable } from './util';

export const AllDexProtocols = [
  'uniswap_v3',
  'uniswap_v2',
  'aerodrome_basic',
  'aerodrome_slipstream',
] as const;

export type DexProtocol = (typeof AllDexProtocols)[number];
export type DexName = 'uniswap' | 'aerodrome';

export type EvmSwap = {
  dexName: DexName;
  protocol: DexProtocol;
  block: BlockRef;
  account: string;
  tokenA: {
    amount: bigint;
    address: string;
    sender: string;
  };
  tokenB: {
    amount: bigint;
    address: string;
    recipient: string;
  };
  factory: {
    address: string;
  };
  transaction: {
    hash: string;
    index: number;
    logIndex: number;
  };
  timestamp: Date;
};

export type DecodedEvmSwap = {
  dexName: DexName;
  protocol: DexProtocol;
  from: {
    amount: bigint;
    sender: string;
  };
  to: {
    amount: bigint;
    recipient: string;
  };
  // liquidity: bigint;
  // tick: number;
  // sqrtPriceX96: bigint;
};

type Args = {
  network: Network;
  block: BlockRange;
  dbPath: string;
  protocols?: DexProtocol[];
  onlyPools?: boolean;
};

export class EvmSwapStream extends AbstractStream<Args, EvmSwap> {
  poolMetadataStorage: PoolMetadataStorage;

  initialize() {
    this.poolMetadataStorage = new PoolMetadataStorage(
      this.options.args.dbPath,
      this.options.args.network,
    );
  }

  async stream(): Promise<ReadableStream<EvmSwap[]>> {
    const { args } = this.options;

    const protocols = args.protocols || AllDexProtocols;

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
      logs: protocols.flatMap((protocol) => {
        const mapping = NetworksMappings[args.network][protocol];
        if (!mapping) {
          throw new Error(`Protocol "${protocol}" is not supported in ${args.network} chain`);
        }

        if (args.onlyPools) {
          return [mapping.pools];
        }

        return [mapping.pools, mapping.swaps];
      }),
    });

    return source.pipeThrough(
      new TransformStream({
        transform: ({ blocks }, controller) => {
          this.handlePools(blocks);

          if (args.onlyPools) {
            // FIXME bad design
            controller.enqueue([]);
            return;
          }

          const events = blocks
            .flatMap((block: any) => {
              if (!block.logs || !block.transactions) return [];

              return block.logs.map((log) => {
                const transaction = block.transactions.find(
                  (tx) => tx.hash === log.transactionHash,
                );
                if (!transaction) {
                  this.logger.error(
                    `transaction not found ${log.transactionHash} in block ${block.header.number}`,
                  );
                  return null;
                }

                let swap: DecodedEvmSwap | null = null;
                if (UniswapV2SwapsEvents.Swap.is(log)) {
                  swap = handleUniswapV2Swap(log);
                } else if (UniswapV3SwapsEvents.Swap.is(log)) {
                  swap = handleUniswapV3Swap(log);
                } else if (AerodromeSwapEvents.BasicPoolSwap.is(log)) {
                  swap = handleAerodromeBasicSwap(log);
                } else if (AerodromeSwapEvents.SlipstreamPoolSwap.is(log)) {
                  swap = handleAerodromeSlipstreamSwap(log);
                }

                const poolMetadata = this.poolMetadataStorage.getPoolMetadata(log.address);
                if (!poolMetadata) {
                  return null;
                }

                if (swap) {
                  return {
                    dexName: swap.dexName,
                    protocol: swap.protocol,
                    account: transaction.from,
                    pool: {
                      address: log.address,
                    },
                    tokenA: {
                      amount: swap.from.amount,
                      address: poolMetadata.token_a,
                      sender: swap.from.sender,
                    },
                    tokenB: {
                      amount: swap.to.amount,
                      address: poolMetadata.token_b,
                      recipient: swap.to.recipient,
                    },
                    factory: {
                      address: poolMetadata.factory_address,
                    },
                    block: block.header,
                    transaction: {
                      hash: log.transactionHash,
                      index: log.transactionIndex,
                      logIndex: log.logIndex,
                    },
                    timestamp: new Date(block.header.timestamp * 1000),
                  };
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

  handlePools(blocks: any[]) {
    const { args } = this.options;

    const pools = blocks
      .flatMap((block: any) => {
        if (!block.logs) return [];

        return block.logs.map((l) => {
          let md: PoolMetadata | null = null;
          if (UniswapV2FactoryEvents.PairCreated.is(l)) {
            const data = UniswapV2FactoryEvents.PairCreated.decode(l);
            md = {
              network: args.network,
              pool: data.pair,
              token_a: data.token0,
              token_b: data.token1,
              factory_address: l.address,
              dex_name: 'uniswap',
              protocol: 'uniswap_v2',
              block_number: block.header.number,
            };
          } else if (UniswapV3FactoryEvents.PoolCreated.is(l)) {
            const data = UniswapV3FactoryEvents.PoolCreated.decode(l);
            md = {
              network: args.network,
              pool: data.pool,
              token_a: data.token0,
              token_b: data.token1,
              factory_address: l.address,
              dex_name: 'uniswap',
              protocol: 'uniswap_v3',
              block_number: block.header.number,
            };
          } else if (AerodromeFactoryEvents.BasicPoolCreated.is(l)) {
            const data = AerodromeFactoryEvents.BasicPoolCreated.decode(l);
            md = {
              network: args.network,
              pool: data.pool,
              token_a: data.token0,
              token_b: data.token1,
              factory_address: l.address,
              dex_name: 'aerodrome',
              protocol: 'aerodrome_basic',
              block_number: block.header.number,
            };
          } else if (AerodromeFactoryEvents.CLFactoryPoolCreated.is(l)) {
            const data = AerodromeFactoryEvents.CLFactoryPoolCreated.decode(l);
            md = {
              network: args.network,
              pool: data.pool,
              token_a: data.token0,
              token_b: data.token1,
              factory_address: l.address,
              dex_name: 'aerodrome',
              protocol: 'aerodrome_slipstream',
              block_number: block.header.number,
            };
          }
          return md;
        });
      })
      .filter(nonNullable);
    if (pools.length) {
      this.poolMetadataStorage.savePoolMetadataIntoDb(pools);
    }
  }
}
