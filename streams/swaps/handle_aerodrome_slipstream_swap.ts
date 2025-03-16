import { TxInfo, EvmSwap } from './evm_swap_stream';
import { PoolMetadataStorage } from './pool_metadata_storage';
import { events as AerodromeSwapEvents } from './aerodrome/swaps';
export const handleAerodromeSlipstreamSwap = (
  l: any,
  transaction: any,
  txInfo: TxInfo,
  poolMetadataStorage: PoolMetadataStorage,
): EvmSwap | null => {
  const poolMetadata = poolMetadataStorage.getPoolMetadata(l.address);
  if (!poolMetadata) {
    return null;
  }

  const data = AerodromeSwapEvents.SlipstreamPoolSwap.decode(l);

  return {
    dexName: 'aerodrome',
    protocol: 'aerodrome_slipstream',
    account: transaction.from,
    tokenA: {
      address: poolMetadata.token_a,
      amount: data.amount0,
      sender: data.sender,
    },
    tokenB: {
      address: poolMetadata.token_b,
      amount: data.amount1,
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
