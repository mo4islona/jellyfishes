import { Network } from '../../evm_dexes/config';
import {
  AERODROME_DEPLOYMENTS,
  UNISWAP_V2_DEPLOYMENTS,
  UNISWAP_V3_DEPLOYMENTS,
} from './deployments';
import { Dex, DexName, Protocol } from './evm_swap_stream';
import { events as UniswapV3FactoryEvents } from './uniswap.v3/factory';
import { events as UniswapV3SwapEvents } from './uniswap.v3/swaps';
import { events as UniswapV2FactoryEvents } from './uniswap.v2/factory';
import { events as UniswapV2SwapEvents } from './uniswap.v2/swaps';
import { events as AerodromeFactoryEvents } from './aerodrome/factory';
import { events as AerodromeSwapEvents } from './aerodrome/swaps';

const logsMap = new Map<string, any[]>();

export const dexToLogs = (dex: Dex, network: Network, includeSwaps: boolean = true): any[] => {
  const key = `${network}-${dex.dexName}-${dex.protocol}`;
  const logs = logsMap.get(key);

  if (!logs) {
    throw new Error(`dex: ${dex.dexName} protocol: ${dex.protocol} on ${network} not supported`);
  }

  if (!includeSwaps) {
    return [logs.at(0)];
  }

  return logs;
};

const init = (network: Network, dexName: DexName, protocol: Protocol, logs: any[]) => {
  if (logsMap.has(`${network}-${dexName}-${protocol}`)) {
    throw new Error(`dex: ${dexName} protocol: ${protocol} on ${network} already initialized`);
  }

  logsMap.set(`${network}-${dexName}-${protocol}`, logs);
  return logs;
};

// Initialize all supported DEX logs
// Ethereum Mainnet
init('ethereum-mainnet', 'uniswap', 'uniswap.v3', [
  {
    address: [UNISWAP_V3_DEPLOYMENTS['ethereum-mainnet'].UniswapV3Factory],
    topic0: [UniswapV3FactoryEvents.PoolCreated.topic],
    transaction: true,
  },
  {
    topic0: [UniswapV3SwapEvents.Swap.topic],
    transaction: true,
  },
]);

// Base Mainnet
init('base-mainnet', 'uniswap', 'uniswap.v3', [
  {
    address: [UNISWAP_V3_DEPLOYMENTS['base-mainnet'].UniswapV3Factory],
    topic0: [UniswapV3FactoryEvents.PoolCreated.topic],
    transaction: true,
  },
  {
    topic0: [UniswapV3SwapEvents.Swap.topic],
    transaction: true,
  },
]);

init('base-mainnet', 'uniswap', 'uniswap.v2', [
  {
    address: [UNISWAP_V2_DEPLOYMENTS['base-mainnet'].UniswapV2Factory],
    topic0: [UniswapV2FactoryEvents.PairCreated.topic],
    transaction: true,
  },
  {
    topic0: [UniswapV2SwapEvents.Swap.topic],
    transaction: true,
  },
]);

init('base-mainnet', 'aerodrome', 'aerodrome_basic', [
  {
    address: [AERODROME_DEPLOYMENTS['base-mainnet'].BasicPoolFactory],
    topic0: [AerodromeFactoryEvents.BasicPoolCreated.topic],
    transaction: true,
  },
  {
    topic0: [AerodromeSwapEvents.BasicPoolSwap.topic],
    transaction: true,
  },
]);

init('base-mainnet', 'aerodrome', 'aerodrome_slipstream', [
  {
    address: [AERODROME_DEPLOYMENTS['base-mainnet'].SlipstreamPoolFactory],
    topic0: [AerodromeFactoryEvents.CLFactoryPoolCreated.topic],
    transaction: true,
  },
  {
    topic0: [AerodromeSwapEvents.SlipstreamPoolSwap.topic],
    transaction: true,
  },
]);
