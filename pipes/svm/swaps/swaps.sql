CREATE TABLE IF NOT EXISTS solana_swaps_raw
(
    timestamp           DateTime CODEC (DoubleDelta, ZSTD),
    dex                 LowCardinality(String),
    token_a             String,
    token_b             String,
    amount_a            Float64,
    amount_b            Float64,
    account             String,
    block_number        UInt32 CODEC (DoubleDelta, ZSTD),
    transaction_index   UInt16,
    instruction_address Array(UInt16),
    transaction_hash    String,
    sign                Int8
) ENGINE = CollapsingMergeTree(sign)
      PARTITION BY toYYYYMM(timestamp) -- DATA WILL BE SPLIT BY MONTH
      ORDER BY (block_number, transaction_index, instruction_address);

---

CREATE MATERIALIZED VIEW IF NOT EXISTS solana_dex_swaps_5m_candles ENGINE AggregatingMergeTree() ORDER BY (timestamp, token_a, token_b, dex)
AS
SELECT toStartOfFiveMinute(timestamp)                     as timestamp,
       token_a,
       token_b,
       dex,
       argMinState(abs(amount_b / amount_a), timestamp) AS open,    -- no reorg support
       maxState(abs(amount_b / amount_a))               AS high,    -- no reorg support
       minState(abs(amount_b / amount_a))               AS low,     -- no reorg support
       argMaxState(abs(amount_b / amount_a), timestamp) AS close,   -- no reorg support
       sumState(sign)                                   AS count,   -- supports blockhain reorgs
       sumState(abs(amount_b) * sign)                   AS volume_b -- supports blockhain reorgs
from solana_swaps_raw
WHERE amount_a != 0
  AND amount_b != 0
GROUP BY timestamp, token_a, token_b, dex;