import { DecodedEvmSwap } from './evm_swap_stream';
import { events as UniswapV2SwapsEvents } from './uniswap.v2/swaps';

export const handleUniswapV2Swap = (log: any): DecodedEvmSwap | null => {
  const data = UniswapV2SwapsEvents.Swap.decode(log);

  return {
    dexName: 'uniswap',
    protocol: 'uniswap_v2',
    from: {
      amount: data.amount0Out > 0n ? -data.amount0Out : data.amount0In,
      sender: data.sender,
    },
    to: {
      amount: data.amount1Out > 0n ? -data.amount1Out : data.amount1In,
      recipient: data.to,
    },
  };
};
