import { TxInfo } from './evm_swap_stream';
import { PoolMetadataStorage } from './pool_metadata_storage';
import { EvmSwap } from './evm_swap_stream';
import { events as UniswapV2SwapsEvents } from './uniswap.v2/swaps';

export const handleUniswapV2Swap = (
  l: any,
  transaction: any,
  txInfo: TxInfo,
  poolMetadataStorage: PoolMetadataStorage,
): EvmSwap | null => {
  const poolMetadata = poolMetadataStorage.getPoolMetadata(l.address);
  if (!poolMetadata) {
    return null;
  }

  const data = UniswapV2SwapsEvents.Swap.decode(l);

  return {
    dexName: 'uniswap',
    protocol: 'uniswap.v2',
    account: transaction.from,
    tokenA: {
      address: poolMetadata?.token_a,
      amount: data.amount0Out > 0n ? data.amount0Out : data.amount0In,
      sender: data.sender,
    },
    tokenB: {
      address: poolMetadata.token_b,
      amount: data.amount1Out > 0n ? data.amount1Out : data.amount1In,
      recipient: data.to,
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
