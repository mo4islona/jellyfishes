import { indexed, event } from '@subsquid/evm-abi';
import * as p from '@subsquid/evm-codec';
export const events = {
  SlipstreamPoolSwap: event(
    '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67',
    'Swap(address,address,int256,int256,uint160,uint128,int24)',
    {
      sender: indexed(p.address),
      recipient: indexed(p.address),
      amount0: p.int256,
      amount1: p.int256,
      sqrtPriceX96: p.uint160,
      liquidity: p.uint128,
      tick: p.int24,
    },
  ),
  BasicPoolSwap: event(
    '0xb3e2773606abfd36b5bd91394b3a54d1398336c65005baf7bf7a05efeffaf75b',
    'Swap(address,address,uint256,uint256,uint256,uint256)',
    {
      sender: indexed(p.address),
      recipient: indexed(p.address),
      amount0In: p.uint256,
      amount1In: p.uint256,
      amount0Out: p.uint256,
      amount1Out: p.uint256,
    },
  ),
};
