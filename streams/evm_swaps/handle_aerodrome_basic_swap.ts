import { events as AerodromeSwapEvents } from './aerodrome/swaps';
import { DecodedEvmSwap } from './evm_swap_stream';

export const handleAerodromeBasicSwap = (log: any): DecodedEvmSwap | null => {
  const data = AerodromeSwapEvents.BasicPoolSwap.decode(log);

  // https://basescan.org/address/0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43#code , router, _swap() function.
  // only one of amount0Out / amount1Out is greater than zero
  return {
    dexName: 'aerodrome',
    protocol: 'aerodrome_basic',
    from: {
      amount: data.amount0Out > 0n ? -data.amount0Out : data.amount0In,
      sender: data.sender,
    },
    to: {
      amount: data.amount1Out > 0n ? -data.amount1Out : data.amount1In,
      recipient: data.recipient,
    },
  };
};
