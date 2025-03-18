import { DexPool, DexPoolStream } from '../dex_pools/dex_pool_stream';
import { events as abiUniswapV3 } from './uniswap';
import { events as abiAlgebraV1 } from './algebra';

export type UniswapPoolData = {
  tokenA: string;
  tokenB: string;
  pool: string;
  fee?: number;
  tickSpacing?: number;
};

export class UniswapPoolStream extends DexPoolStream<UniswapPoolData, UniswapPoolData & DexPool> {
  protected getLogFilters(): any[] {
    return [
      {
        topic0: [abiUniswapV3.PoolCreated.topic, abiAlgebraV1.Pool.topic],
        transaction: true,
      },
    ];
  }

  protected decodePoolFromEvent(log: any): UniswapPoolData | null {
    if (abiAlgebraV1.Pool.is(log)) {
      const data = abiAlgebraV1.Pool.decode(log);
      return {
        pool: data.pool,
        tokenA: data.token0,
        tokenB: data.token1,
      };
    } else if (abiUniswapV3.PoolCreated.is(log)) {
      const data = abiUniswapV3.PoolCreated.decode(log);

      return {
        pool: data.pool,
        tokenA: data.token0,
        tokenB: data.token1,
        tickSpacing: data.tickSpacing,
        fee: data.fee,
      };
    }

    return null;
  }
}
