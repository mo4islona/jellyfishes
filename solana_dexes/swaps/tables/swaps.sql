CREATE TABLE IF NOT EXISTS solana_swaps_raw
(
    timestamp         DateTime CODEC (DoubleDelta, ZSTD),
    dex               LowCardinality(String),
    token_a           String,
    token_b           String,
    a_to_b            Bool,
    amount_a          Float32,
    amount_b          Float32,
    account           String,
    block_number      UInt32,
    transaction_index UInt16,
    transaction_hash  String
) ENGINE = ReplacingMergeTree()
      PARTITION BY toYYYYMM(timestamp) -- DATA WILL BE SPLIT BY MONTH
      ORDER BY (block_number, transaction_index); -- DEDUPLICATION KEY

CREATE MATERIALIZED VIEW IF NOT EXISTS solana_swaps_candles_5m
            (
             timestamp DateTime,
             token_a String,
             token_b String,
             open Float32,
             high Float32,
             low Float32,
             close Float32,
             count UInt32,
             traders UInt32,
             volume_b Float32
                ) ENGINE = ReplacingMergeTree() ORDER BY (timestamp, token_a, token_b) POPULATE
AS
SELECT toStartOfFiveMinute(timestamp)   as timestamp,
       token_a,
       token_b,
       first_value(amount_b / amount_a) as open,
       max(amount_b / amount_a)         as high,
       min(amount_b / amount_a)         as low,
       last_value(amount_b / amount_a)  as close,
       count()                          as count,
       uniq(account)                    as traders,
       sum(amount_b)                    as volume_b
from solana_swaps_raw
WHERE amount_a > 0
  AND amount_b > 0
GROUP BY timestamp, token_a, token_b;