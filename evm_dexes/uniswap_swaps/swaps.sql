CREATE TABLE IF NOT EXISTS uniswap_v3_swaps_raw
(
    timestamp           DateTime CODEC (DoubleDelta, ZSTD),
    dex                 LowCardinality(String),
    token_a             String,
    token_b             String,
    a_to_b              Bool,
    amount_a            Float64,
    amount_b            Float64,
    account             String,
    block_number        UInt32,
    transaction_index   UInt16,
    transaction_hash    String,
    sign                Int8
) ENGINE = CollapsingMergeTree(sign)
      PARTITION BY toYYYYMM(timestamp) -- DATA WILL BE SPLIT BY MONTH
      ORDER BY (block_number, transaction_index);
