import * as p from '@subsquid/evm-codec';
import { event, fun, viewFun, indexed, ContractBase } from '@subsquid/evm-abi';
import type { EventParams as EParams, FunctionArguments, FunctionReturn } from '@subsquid/evm-abi';

export const events = {
  DefaultCommunityFee: event(
    '0x88cb5103fd9d88d417e72dc496030c71c65d1500548a9e9530e7d812b6a35558',
    'DefaultCommunityFee(uint8)',
    { newDefaultCommunityFee: p.uint8 },
  ),
  FarmingAddress: event(
    '0x56b9e8342f530796ceed0d5529abdcdeae6e4f2ac1dc456ceb73bbda898e0cd3',
    'FarmingAddress(address)',
    { newFarmingAddress: indexed(p.address) },
  ),
  FeeConfiguration: event(
    '0x4035ab409f15e202f9f114632e1fb14a0552325955722be18503403e7f98730c',
    'FeeConfiguration(uint16,uint16,uint32,uint32,uint16,uint16,uint32,uint16,uint16)',
    {
      alpha1: p.uint16,
      alpha2: p.uint16,
      beta1: p.uint32,
      beta2: p.uint32,
      gamma1: p.uint16,
      gamma2: p.uint16,
      volumeBeta: p.uint32,
      volumeGamma: p.uint16,
      baseFee: p.uint16,
    },
  ),
  Owner: event(
    '0xa5e220c2c27d986cc8efeafa8f34ba6ea6bf96a34e146b29b6bdd8587771b130',
    'Owner(address)',
    { newOwner: indexed(p.address) },
  ),
  Pool: event(
    '0x91ccaa7a278130b65168c3a0c8d3bcae84cf5e43704342bd3ec0b59e59c036db',
    'Pool(address,address,address)',
    { token0: indexed(p.address), token1: indexed(p.address), pool: p.address },
  ),
  VaultAddress: event(
    '0xb9c265ae4414f501736ec5d4961edc3309e4385eb2ff3feeecb30fb36621dd83',
    'VaultAddress(address)',
    { newVaultAddress: indexed(p.address) },
  ),
};

export const functions = {
  baseFeeConfiguration: viewFun(
    '0x9832853a',
    'baseFeeConfiguration()',
    {},
    {
      alpha1: p.uint16,
      alpha2: p.uint16,
      beta1: p.uint32,
      beta2: p.uint32,
      gamma1: p.uint16,
      gamma2: p.uint16,
      volumeBeta: p.uint32,
      volumeGamma: p.uint16,
      baseFee: p.uint16,
    },
  ),
  createPool: fun(
    '0xe3433615',
    'createPool(address,address)',
    { tokenA: p.address, tokenB: p.address },
    p.address,
  ),
  defaultCommunityFee: viewFun('0x2f8a39dd', 'defaultCommunityFee()', {}, p.uint8),
  farmingAddress: viewFun('0x8a2ade58', 'farmingAddress()', {}, p.address),
  owner: viewFun('0x8da5cb5b', 'owner()', {}, p.address),
  poolByPair: viewFun(
    '0xd9a641e1',
    'poolByPair(address,address)',
    { _0: p.address, _1: p.address },
    p.address,
  ),
  poolDeployer: viewFun('0x3119049a', 'poolDeployer()', {}, p.address),
  setBaseFeeConfiguration: fun(
    '0x5d6d7e93',
    'setBaseFeeConfiguration(uint16,uint16,uint32,uint32,uint16,uint16,uint32,uint16,uint16)',
    {
      alpha1: p.uint16,
      alpha2: p.uint16,
      beta1: p.uint32,
      beta2: p.uint32,
      gamma1: p.uint16,
      gamma2: p.uint16,
      volumeBeta: p.uint32,
      volumeGamma: p.uint16,
      baseFee: p.uint16,
    },
  ),
  setDefaultCommunityFee: fun('0x371e3521', 'setDefaultCommunityFee(uint8)', {
    newDefaultCommunityFee: p.uint8,
  }),
  setFarmingAddress: fun('0xb001f618', 'setFarmingAddress(address)', {
    _farmingAddress: p.address,
  }),
  setOwner: fun('0x13af4035', 'setOwner(address)', { _owner: p.address }),
  setVaultAddress: fun('0x85535cc5', 'setVaultAddress(address)', { _vaultAddress: p.address }),
  vaultAddress: viewFun('0x430bf08a', 'vaultAddress()', {}, p.address),
};

export class Algebra extends ContractBase {
  baseFeeConfiguration() {
    return this.eth_call(functions.baseFeeConfiguration, {});
  }

  defaultCommunityFee() {
    return this.eth_call(functions.defaultCommunityFee, {});
  }

  farmingAddress() {
    return this.eth_call(functions.farmingAddress, {});
  }

  owner() {
    return this.eth_call(functions.owner, {});
  }

  poolByPair(_0: PoolByPairParams['_0'], _1: PoolByPairParams['_1']) {
    return this.eth_call(functions.poolByPair, { _0, _1 });
  }

  poolDeployer() {
    return this.eth_call(functions.poolDeployer, {});
  }

  vaultAddress() {
    return this.eth_call(functions.vaultAddress, {});
  }
}

/// Event types
export type DefaultCommunityFeeEventArgs = EParams<typeof events.DefaultCommunityFee>;
export type FarmingAddressEventArgs = EParams<typeof events.FarmingAddress>;
export type FeeConfigurationEventArgs = EParams<typeof events.FeeConfiguration>;
export type OwnerEventArgs = EParams<typeof events.Owner>;
export type PoolEventArgs = EParams<typeof events.Pool>;
export type VaultAddressEventArgs = EParams<typeof events.VaultAddress>;

/// Function types
export type BaseFeeConfigurationParams = FunctionArguments<typeof functions.baseFeeConfiguration>;
export type BaseFeeConfigurationReturn = FunctionReturn<typeof functions.baseFeeConfiguration>;

export type CreatePoolParams = FunctionArguments<typeof functions.createPool>;
export type CreatePoolReturn = FunctionReturn<typeof functions.createPool>;

export type DefaultCommunityFeeParams = FunctionArguments<typeof functions.defaultCommunityFee>;
export type DefaultCommunityFeeReturn = FunctionReturn<typeof functions.defaultCommunityFee>;

export type FarmingAddressParams = FunctionArguments<typeof functions.farmingAddress>;
export type FarmingAddressReturn = FunctionReturn<typeof functions.farmingAddress>;

export type OwnerParams = FunctionArguments<typeof functions.owner>;
export type OwnerReturn = FunctionReturn<typeof functions.owner>;

export type PoolByPairParams = FunctionArguments<typeof functions.poolByPair>;
export type PoolByPairReturn = FunctionReturn<typeof functions.poolByPair>;

export type PoolDeployerParams = FunctionArguments<typeof functions.poolDeployer>;
export type PoolDeployerReturn = FunctionReturn<typeof functions.poolDeployer>;

export type SetBaseFeeConfigurationParams = FunctionArguments<
  typeof functions.setBaseFeeConfiguration
>;
export type SetBaseFeeConfigurationReturn = FunctionReturn<
  typeof functions.setBaseFeeConfiguration
>;

export type SetDefaultCommunityFeeParams = FunctionArguments<
  typeof functions.setDefaultCommunityFee
>;
export type SetDefaultCommunityFeeReturn = FunctionReturn<typeof functions.setDefaultCommunityFee>;

export type SetFarmingAddressParams = FunctionArguments<typeof functions.setFarmingAddress>;
export type SetFarmingAddressReturn = FunctionReturn<typeof functions.setFarmingAddress>;

export type SetOwnerParams = FunctionArguments<typeof functions.setOwner>;
export type SetOwnerReturn = FunctionReturn<typeof functions.setOwner>;

export type SetVaultAddressParams = FunctionArguments<typeof functions.setVaultAddress>;
export type SetVaultAddressReturn = FunctionReturn<typeof functions.setVaultAddress>;

export type VaultAddressParams = FunctionArguments<typeof functions.vaultAddress>;
export type VaultAddressReturn = FunctionReturn<typeof functions.vaultAddress>;
