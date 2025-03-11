import { AbstractStream, BlockRef, Offset } from '../../core/abstract_stream';
import { DexPool, DexPoolStream } from '../dex_pools/dex_pool_stream';
import { events as abiAerodrome } from './aerodrome';

export type AerodromePoolData =  {
  tokenA: string;
  tokenB: string;
  pool: string;
  tickSpacing: number;
};

export class AerodromePoolStream extends DexPoolStream<AerodromePoolData, AerodromePoolData & DexPool> {
  protected getLogFilters(): any[] {
    return [
      {
        topic0: [abiAerodrome.PoolCreated.topic],
        transaction: true,
      },
    ];
  }

  protected decodePoolFromEvent(log: any): AerodromePoolData | null {
    if (abiAerodrome.PoolCreated.is(log)) {
      const data = abiAerodrome.PoolCreated.decode(log);

      return {
        pool: data.pool,
        tokenA: data.token0,
        tokenB: data.token1,
        tickSpacing: data.tickSpacing,
      };
    }

    return null;
  }
}
