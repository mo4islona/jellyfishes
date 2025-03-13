import { Network } from '../../evm_dexes/config';
import { AERODROME_DEPLOYMENTS, UNISWAP_V3_DEPLOYMENTS } from './deployments';
import { Dex } from './evm_swap_stream';
import { events as UniswapV3FactoryEvents } from './uniswap.v3/factory';
import { events as UniswapV3SwapEvents } from './uniswap.v3/swaps';
import { events as AerodromeFactoryEvents } from './aerodrome/factory';
import { events as AerodromeSwapEvents } from './aerodrome/swaps';

export const dexToLogs = (dex: Dex, network: Network): any => {
  switch (network) {
    case 'ethereum-mainnet':
      if (dex.dexName === 'uniswap' && dex.protocol === 'uniswap.v3') {
        return [
          {
            address: [UNISWAP_V3_DEPLOYMENTS[network].UniswapV3Factory],
            topic0: [UniswapV3FactoryEvents.PoolCreated.topic],
            transaction: true,
          },
          {
            topic0: [UniswapV3SwapEvents.Swap.topic],
            transaction: true,
          },
        ];
      }
      break;

    case 'base-mainnet':
      if (dex.dexName === 'uniswap' && dex.protocol === 'uniswap.v3') {
        return [
          {
            address: [UNISWAP_V3_DEPLOYMENTS[network].UniswapV3Factory],
            topic0: [UniswapV3FactoryEvents.PoolCreated.topic],
            transaction: true,
          },
          {
            topic0: [UniswapV3SwapEvents.Swap.topic],
            transaction: true,
          },
        ];
      } else if (dex.dexName === 'aerodrome' && dex.protocol === 'aerodrome_basic') {
        return [
          {
            address: [AERODROME_DEPLOYMENTS[network].BasicPoolFactory],
            topic0: [AerodromeFactoryEvents.BasicPoolCreated.topic],
            transaction: true,
          },
          {
            topic0: [AerodromeSwapEvents.BasicPoolSwap.topic],
            transaction: true,
          },
        ];
      } else if (dex.dexName === 'aerodrome' && dex.protocol === 'aerodrome_slipstream') {
        return [
          {
            address: [AERODROME_DEPLOYMENTS[network].CLPoolFactory],
            topic0: [AerodromeFactoryEvents.CLFactoryPoolCreated.topic],
            transaction: true,
          },
          {
            topic0: [AerodromeSwapEvents.SlipstreamPoolSwap.topic],
            transaction: true,
          },
        ];
      }
      break;
  }

  throw new Error(`dex: ${dex.dexName} protocol: ${dex.protocol} on ${network} not supported`);
};
