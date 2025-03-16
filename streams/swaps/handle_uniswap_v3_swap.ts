import { TxInfo } from './evm_swap_stream';
import { PoolMetadataStorage } from './pool_metadata_storage';
import { EvmSwap } from './evm_swap_stream';
import { events as UniswapV3SwapsEvents } from './uniswap.v3/swaps';
import { events as UniswapV3FactoryEvents } from './uniswap.v3/factory';
import { events as AerodromeFactoryEvents } from './aerodrome/factory';
import { events as AerodromeSwapEvents } from './aerodrome/swaps';

export const handleUniswapV3Swap = (
  l: any,
  transaction: any,
  txInfo: TxInfo,
  poolMetadataStorage: PoolMetadataStorage,
): EvmSwap | null => {
  const poolMetadata = poolMetadataStorage.getPoolMetadata(l.address);
  if (!poolMetadata) {
    return null;
  }

  const data = UniswapV3SwapsEvents.Swap.decode(l);

  return {
    dexName: 'uniswap',
    protocol: 'uniswap.v3',
    account: transaction.from,
    tokenA: {
      address: poolMetadata?.token_a,
      amount: data.amount0,
      sender: data.sender,
    },
    tokenB: {
      address: poolMetadata.token_b,
      amount: data.amount1,
      recipient: data.recipient,
    },
    factory: {
      address: poolMetadata?.factory_address,
    },
    pool: {
      address: l.address,
    },
    ...txInfo,
  };
};
