import * as p from '@subsquid/evm-codec';
import { event, fun, viewFun, indexed, ContractBase } from '@subsquid/evm-abi';
import type { EventParams as EParams, FunctionArguments, FunctionReturn } from '@subsquid/evm-abi';

export const events = {
  // Aerodrome Slipstream
  // https://basescan.org/address/0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A
  CLFactoryPoolCreated: event(
    '0xab0d57f0df537bb25e80245ef7748fa62353808c54d6e528a9dd20887aed9ac2',
    'PoolCreated(address,address,int24,address)',
    {
      token0: indexed(p.address),
      token1: indexed(p.address),
      tickSpacing: indexed(p.int24),
      pool: p.address,
    },
  ),

  // Basic Aerodrome
  // https://basescan.org/address/0x420DD381b31aEf6683db6B902084cB0FFECe40Da#events
  BasicPoolCreated: event(
    '0x2128d88d14c80cb081c1252a5acff7a264671bf199ce226b53788fb26065005e',
    'PoolCreated(address,address,bool,address,uint256)',
    {
      token0: indexed(p.address),
      token1: indexed(p.address),
      stable: indexed(p.bool),
      pool: p.address,
      noname: p.uint256,
    },
  ),
};
