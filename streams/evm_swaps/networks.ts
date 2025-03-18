import {
  AERODROME_DEPLOYMENTS,
  UNISWAP_V2_DEPLOYMENTS,
  UNISWAP_V3_DEPLOYMENTS,
} from './deployments';
import { DexProtocol } from './evm_swap_stream';
import { events as UniswapV3FactoryEvents } from './uniswap.v3/factory';
import { events as UniswapV3SwapEvents } from './uniswap.v3/swaps';
import { events as UniswapV2FactoryEvents } from './uniswap.v2/factory';
import { events as UniswapV2SwapEvents } from './uniswap.v2/swaps';
import { events as AerodromeFactoryEvents } from './aerodrome/factory';
import { events as AerodromeSwapEvents } from './aerodrome/swaps';

export type Network = 'base-mainnet' | 'ethereum-mainnet';

export const NetworksMappings: Record<
  Network,
  Partial<Record<DexProtocol, { pools: any; swaps: any }>>
> = {
  'ethereum-mainnet': {
    uniswap_v3: {
      pools: {
        address: [UNISWAP_V3_DEPLOYMENTS['ethereum-mainnet'].UniswapV3Factory],
        topic0: [UniswapV3FactoryEvents.PoolCreated.topic],
        transaction: true,
      },
      swaps: [
        {
          topic0: [UniswapV3SwapEvents.Swap.topic],
          transaction: true,
        },
      ],
    },
  },
  'base-mainnet': {
    uniswap_v3: {
      pools: {
        address: [UNISWAP_V3_DEPLOYMENTS['base-mainnet'].UniswapV3Factory],
        topic0: [UniswapV3FactoryEvents.PoolCreated.topic],
        transaction: true,
      },
      swaps: {
        topic0: [UniswapV3SwapEvents.Swap.topic],
        transaction: true,
      },
    },
    uniswap_v2: {
      pools: {
        address: [UNISWAP_V2_DEPLOYMENTS['base-mainnet'].UniswapV2Factory],
        topic0: [UniswapV2FactoryEvents.PairCreated.topic],
        transaction: true,
      },
      swaps: {
        topic0: [UniswapV2SwapEvents.Swap.topic],
        transaction: true,
      },
    },
    aerodrome_basic: {
      pools: {
        address: [AERODROME_DEPLOYMENTS['base-mainnet'].BasicPoolFactory],
        topic0: [AerodromeFactoryEvents.BasicPoolCreated.topic],
        transaction: true,
      },
      swaps: {
        topic0: [AerodromeSwapEvents.BasicPoolSwap.topic],
        transaction: true,
      },
    },
    aerodrome_slipstream: {
      pools: {
        address: [AERODROME_DEPLOYMENTS['base-mainnet'].SlipstreamPoolFactory],
        topic0: [AerodromeFactoryEvents.CLFactoryPoolCreated.topic],
        transaction: true,
      },
      swaps: {
        topic0: [AerodromeSwapEvents.SlipstreamPoolSwap.topic],
        transaction: true,
      },
    },
  },
};
