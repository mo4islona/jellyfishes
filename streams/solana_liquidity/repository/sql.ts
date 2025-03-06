/**
 * SQL query constants for Solana Pools repository
 */

export const CREATE_POOLS_TABLE = `
  CREATE TABLE IF NOT EXISTS solana_pools (
    lp_mint TEXT PRIMARY KEY,
    token_a TEXT,
    token_b TEXT,
    protocol INTEGER,  -- 1 for raydium, 2 for meteora
    pool_type INTEGER, -- 1 for amm, 2 for clmm
    block_number INTEGER,
    sign INTEGER,
    PRIMARY KEY (lp_mint, token_a, token_b, protocol, pool_type)
  );
`;

export const INSERT_POOL = `
  INSERT OR REPLACE INTO solana_pools (
    lp_mint, token_a, token_b, protocol, pool_type, block_number, sign
  ) VALUES (
    $lp_mint, $token_a, $token_b, $protocol, $pool_type, $block_number, $sign
  )
`;
