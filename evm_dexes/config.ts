export const CONTRACTS = {
  factory: {
    'base-mainnet': {
      address: '0x33128a8fc17869897dce68ed026d694621f6fdfd',
      block: {
        number: 18112225,
      },
    },
    'ethereum-mainnet': {
      address: '0x1f98431c8ad98523631ae4a59f267346ea31f984',
      block: {
        number: 12369621,
      },
    },
  },
};

const PORTAL = {
  'base-mainnet': {
    url: 'https://portal.sqd.dev/datasets/base-mainnet',
  },
  'ethereum-mainnet': {
    url: 'https://portal.sqd.dev/datasets/ethereum-mainnet',
  },
};

export function getConfig() {
  const network =
    process.env.NETWORK === 'ethereum-mainnet' || process.env.NETWORK === 'base-mainnet'
      ? process.env.NETWORK
      : 'ethereum-mainnet';

  return {
    network,
    factory: CONTRACTS.factory[network],
    dbPath: process.env.DB_PATH || './uniswap-pools.db',
    portal: PORTAL[network],
  };
}
