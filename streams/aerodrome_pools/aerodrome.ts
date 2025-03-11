import * as p from '@subsquid/evm-codec';
import { event, fun, viewFun, indexed, ContractBase } from '@subsquid/evm-abi';
import type { EventParams as EParams, FunctionArguments, FunctionReturn } from '@subsquid/evm-abi';

export const events = {
    PoolCreated: event(
        '0xab0d57f0df537bb25e80245ef7748fa62353808c54d6e528a9dd20887aed9ac2',
        'PoolCreated(address,address,int24,address)',
        {
          token0: indexed(p.address),
          token1: indexed(p.address),
          tickSpacing: indexed(p.int24),
          pool: p.address,
        },
      ),
    };
