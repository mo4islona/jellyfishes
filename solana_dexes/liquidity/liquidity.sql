CREATE TABLE IF NOT EXISTS solana_liquidity_transactions
(
    event_type        Enum8('add' = 1, 'remove' = 2, 'initialize' = 3),
    protocol          Enum8('raydium' = 1, 'meteora' = 2),
    pool_type         Enum8('amm' = 1, 'clmm' = 2),
    lp_mint           String,
    timestamp         DateTime CODEC (DoubleDelta, ZSTD),
    token_a           String,
    token_b           String,
    amount_token_a    Float64,
    amount_token_b    Float64,
    sender            String,
    block_number      UInt32,
    transaction_index UInt16,
    transaction_hash  String,
    instruction       Array(UInt16),
    sign              Int8,
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
    token_a,
    token_b,
    protocol,
    pool_type,
    sumStateIf(amount_token_a * sign, event_type IN ('add', 'initialize')) AS total_liquidity_added_token_a,
    sumStateIf(amount_token_b * sign, event_type IN ('add', 'initialize')) AS total_liquidity_added_token_b,
    sumStateIf(amount_token_a * sign, event_type = 'remove') AS total_liquidity_removed_token_a,
    sumStateIf(amount_token_b * sign, event_type = 'remove') AS total_liquidity_removed_token_b,
    sumState(amount_token_a * sign) AS net_liquidity_token_a,
    sumState(amount_token_b * sign) AS net_liquidity_token_b,
    countStateIf(event_type IN ('add', 'initialize') AND sign = 1) AS adds,
    countStateIf(event_type = 'remove' AND sign = 1) AS removes,
    uniqState(sender) AS unique_users
FROM solana_liquidity_transactions
GROUP BY timestamp, lp_mint, token_a, token_b, protocol, pool_type;