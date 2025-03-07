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
      ORDER BY (block_number, lp_mint, sender, transaction_index);

CREATE MATERIALIZED VIEW IF NOT EXISTS solana_liquidity_daily 
ENGINE = AggregatingMergeTree() 
ORDER BY (timestamp, lp_mint)
AS
SELECT 
    toStartOfDay(timestamp) as timestamp,
    lp_mint,
    token_a,
    token_b,
    protocol,
    pool_type,
    sumState(amount_token_a * IF(event_type IN ('add', 'initialize'), 1, -1)) AS token_a_liquidity_change,
    sumState(amount_token_b * IF(event_type IN ('add', 'initialize'), 1, -1)) AS token_b_liquidity_change,
    countState(IF(event_type = 'add', 1, NULL)) AS adds,
    countState(IF(event_type = 'remove', 1, NULL)) AS removes,
    sumState(amount_token_a * IF(event_type IN ('add', 'initialize'), 1, -1)) AS net_liquidity_token_a,
    sumState(amount_token_b * IF(event_type IN ('add', 'initialize'), 1, -1)) AS net_liquidity_token_b,
    uniqState(sender) AS unique_users
FROM solana_liquidity_transactions
GROUP BY timestamp, lp_mint, token_a, token_b, protocol, pool_type;