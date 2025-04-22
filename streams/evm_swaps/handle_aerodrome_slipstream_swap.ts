import { DecodedEvmSwap } from './evm_swap_stream';
import { events as AerodromeSwapEvents } from './aerodrome/swaps';

export const handleAerodromeSlipstreamSwap = (log: any): DecodedEvmSwap | null => {
  const data = AerodromeSwapEvents.SlipstreamPoolSwap.decode(log);

  return {
    dexName: 'aerodrome',
    protocol: 'aerodrome_slipstream',
    from: {
      amount: data.amount0,
      sender: data.sender,
    },
    to: {
      amount: data.amount1,
      recipient: data.recipient,
    },
  };
};
