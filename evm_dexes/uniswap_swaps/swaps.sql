CREATE TABLE IF NOT EXISTS uniswap_v3_swaps_raw_v2
(
    timestamp           DateTime CODEC (DoubleDelta, ZSTD),
    factory_address     LowCardinality(String),
    network             LowCardinality(String),
    token_a             String,
    token_b             String,
    amount_a            Float64,
    amount_b            Float64,
    account             String,
    block_number        UInt32 CODEC (DoubleDelta, ZSTD),
    transaction_index   UInt16,
    log_index           UInt16,
    transaction_hash    String,
    sign                Int8
) ENGINE = CollapsingMergeTree(sign)
      PARTITION BY toYYYYMM(timestamp) -- DATA WILL BE SPLIT BY MONTH
      ORDER BY (timestamp, transaction_index, log_index);
