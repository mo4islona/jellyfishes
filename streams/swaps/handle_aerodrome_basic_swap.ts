import { events as UniswapV3SwapsEvents } from './uniswap.v3/swaps';
import { events as UniswapV3FactoryEvents } from './uniswap.v3/factory';
import { events as AerodromeFactoryEvents } from './aerodrome/factory';
import { events as AerodromeSwapEvents } from './aerodrome/swaps';
import { TxInfo, EvmSwap } from './evm_swap_stream';
import { PoolMetadataStorage } from './pool_metadata_storage';

export const handleAerodromeBasicSwap = (
  l: any,
  transaction: any,
  txInfo: TxInfo,
  poolMetadataStorage: PoolMetadataStorage,
): EvmSwap | null => {
  const poolMetadata = poolMetadataStorage.getPoolMetadata(l.address);
  if (!poolMetadata) {
    return null;
  }

  const data = AerodromeSwapEvents.BasicPoolSwap.decode(l);

  // https://basescan.org/address/0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43#code , router, _swap() function.
  // only one of amount0Out / amount1Out is greater than zero
  return {
    dexName: 'aerodrome',
    protocol: 'aerodrome_basic',
    account: transaction.from,
    tokenA: {
      address: poolMetadata.token_a,
      amount: data.amount0Out > 0n ? -data.amount0Out : data.amount0In,
      sender: data.sender,
    },
    tokenB: {
      address: poolMetadata.token_b,
      amount: data.amount1Out > 0n ? -data.amount1Out : data.amount1In,
      recipient: data.recipient,
    },
    pool: {
      address: l.address,
    },
    factory: {
      address: poolMetadata.factory_address,
    },
    ...txInfo,
  };
};
