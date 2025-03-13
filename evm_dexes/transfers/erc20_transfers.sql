CREATE TABLE IF NOT EXISTS evm_erc20_transfers
(
    timestamp         DateTime CODEC (DoubleDelta, ZSTD),
    network           LowCardinality(String),
    token             String,
    "from"              String,
    "to"                String,
    amount            Float64,
    block_number      UInt32 CODEC (DoubleDelta, ZSTD),
    transaction_index UInt16,
    log_index         UInt16,
    transaction_hash  String,
    sign              Int8
) ENGINE = CollapsingMergeTree(sign)
      PARTITION BY toYYYYMM(timestamp) -- DATA WILL BE SPLIT BY MONTH
      ORDER BY (timestamp, transaction_index, log_index)
;

-- ############################################################################################################
--
-- ############################################################################################################

CREATE TABLE IF NOT EXISTS evm_transfers_5m_volumes
(
    timestamp DateTime CODEC (DoubleDelta, ZSTD),
    account   String,
    token     String,
    count     UInt32,
    amount    Float64
) ENGINE = SummingMergeTree() ORDER BY (timestamp, token, account);

CREATE MATERIALIZED VIEW IF NOT EXISTS evm_token_daily_swaps_volumes_mva TO evm_transfers_5m_volumes AS
SELECT toStartOfFiveMinutes(timestamp) as timestamp,
       "from"                          as account,
       token                           as token,
       sum(-amount * sign)             as amount,
       sum(sign)                       as count
FROM evm_erc20_transfers
GROUP BY timestamp, token, "from";

CREATE MATERIALIZED VIEW IF NOT EXISTS evm_token_daily_swaps_volumes_mvb TO evm_transfers_5m_volumes AS
SELECT toStartOfFiveMinutes(timestamp) as timestamp,
       "to"                            as account,
       token                           as token,
       sum(amount * sign)              as amount,
       sum(sign)                       as count
FROM evm_erc20_transfers
GROUP BY timestamp, token, "to";