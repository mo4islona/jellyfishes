CREATE TABLE IF NOT EXISTS solana_liquidity_transactions
(
    event_type        Enum8('add' = 1, 'remove' = 2, 'initialize' = 3, 'swap' = 4),
    protocol          Enum8('raydium' = 1, 'meteora' = 2, 'orca' = 3),
    pool_type         Enum8('amm' = 1, 'clmm' = 2),
    pool             String,
    lp_mint          String,
    timestamp        DateTime CODEC (DoubleDelta, ZSTD),
    token_a_mint     String,
    token_b_mint     String,
    token_a_vault    String,
    token_b_vault    String,
    token_a_amount_raw   Int128,
    token_b_amount_raw   Int128,
    token_a_balance_raw  UInt128,
    token_b_balance_raw  UInt128,
    token_a_decimals UInt8,
    token_b_decimals UInt8,
    token_a_amount  Float64 MATERIALIZED token_a_amount_raw / pow(10, token_a_decimals),
    token_b_amount   Float64 MATERIALIZED token_b_amount_raw / pow(10, token_b_decimals),
    token_a_balance  Float64 MATERIALIZED token_a_balance_raw / pow(10, token_a_decimals),
    token_b_balance  Float64 MATERIALIZED token_b_balance_raw / pow(10, token_b_decimals),
    sender           String,
    block_number     UInt32,
    transaction_index UInt16,
    transaction_hash String,
    instruction      Array(UInt16),
    offset           String,
    sign             Int8,
) ENGINE = CollapsingMergeTree(sign)
      PARTITION BY toYYYYMM(timestamp)
      ORDER BY (block_number, transaction_index, instruction);

CREATE MATERIALIZED VIEW IF NOT EXISTS solana_liquidity_daily 
ENGINE = AggregatingMergeTree() 
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, lp_mint)
AS
SELECT 
    toStartOfDay(timestamp) as timestamp,
    lp_mint,
    pool,
    token_a_mint,
    token_b_mint,
    token_a_vault,
    token_b_vault,
    protocol,
    pool_type,
    sumStateIf(token_a_amount_raw * sign, event_type IN ('add', 'initialize')) AS total_liquidity_added_token_a_raw,
    sumStateIf(token_b_amount_raw * sign, event_type IN ('add', 'initialize')) AS total_liquidity_added_token_b_raw,
    sumStateIf(token_a_amount_raw * sign, event_type = 'remove') AS total_liquidity_removed_token_a_raw,
    sumStateIf(token_b_amount_raw * sign, event_type = 'remove') AS total_liquidity_removed_token_b_raw,
    sumState(token_a_amount_raw * sign) AS net_liquidity_token_a_raw,
    sumState(token_b_amount_raw * sign) AS net_liquidity_token_b_raw,
    maxState(token_a_balance_raw) AS token_a_balance_raw,
    maxState(token_b_balance_raw) AS token_b_balance_raw,
    avgState(token_a_decimals) AS token_a_decimals,
    avgState(token_b_decimals) AS token_b_decimals,
    sumStateIf(token_a_amount * sign, event_type IN ('add', 'initialize')) AS total_liquidity_added_token_a,
    sumStateIf(token_b_amount * sign, event_type IN ('add', 'initialize')) AS total_liquidity_added_token_b,
    sumStateIf(token_a_amount * sign, event_type = 'remove') AS total_liquidity_removed_token_a,
    sumStateIf(token_b_amount * sign, event_type = 'remove') AS total_liquidity_removed_token_b,
    sumState(token_a_amount * sign) AS net_liquidity_token_a,
    sumState(token_b_amount * sign) AS net_liquidity_token_b,
    maxState(token_a_balance) AS token_a_balance,
    maxState(token_b_balance) AS token_b_balance,
    countStateIf(event_type IN ('add', 'initialize') AND sign = 1) AS adds,
    countStateIf(event_type = 'remove' AND sign = 1) AS removes,
    uniqState(sender) AS unique_users
FROM solana_liquidity_transactions
GROUP BY timestamp, lp_mint, pool, token_a_mint, token_b_mint, token_a_vault, token_b_vault, protocol, pool_type;