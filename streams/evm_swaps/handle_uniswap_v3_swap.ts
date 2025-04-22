import { DecodedEvmSwap } from './evm_swap_stream';
import { events as UniswapV3SwapsEvents } from './uniswap.v3/swaps';

export const handleUniswapV3Swap = (log: any): DecodedEvmSwap | null => {
  const data = UniswapV3SwapsEvents.Swap.decode(log);

  return {
    dexName: 'uniswap',
    protocol: 'uniswap_v3',
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
