CREATE TABLE IF NOT EXISTS evm_erc20_transfers
(
    timestamp         DateTime CODEC (DoubleDelta, ZSTD),
    network           LowCardinality(String),
    token             String,
    "from"            String,
    "to"              String,
    amount            UInt64,
    block_number      UInt32 CODEC (DoubleDelta, ZSTD),
    transaction_index UInt16,
    log_index         UInt16,
    transaction_hash  String,
    sign              Int8
) ENGINE = CollapsingMergeTree(sign)
      PARTITION BY toYYYYMM(timestamp) -- DATA WILL BE SPLIT BY MONTH
      ORDER BY (timestamp, transaction_index, log_index)
      TTL timestamp + INTERVAL 90 DAY;

-- ############################################################################################################
--
-- ############################################################################################################

--  Daily resolution for all historical data

CREATE TABLE IF NOT EXISTS evm_swaps_daily_volumes
(
    timestamp DateTime CODEC (DoubleDelta, ZSTD),
    account   String,
    token     String,
    count     UInt64,
    amount    Int128
) ENGINE = SummingMergeTree() ORDER BY (timestamp, token, account);

CREATE MATERIALIZED VIEW IF NOT EXISTS evm_swaps_daily_volumes_mva TO evm_swaps_daily_volumes AS
SELECT toStartOfDay(timestamp) as timestamp,
       "from"                  as account,
       token                   as token,
       sum(-amount * sign)     as amount,
       sum(sign)               as count
FROM evm_erc20_transfers
GROUP BY timestamp, token, "from";

CREATE MATERIALIZED VIEW IF NOT EXISTS evm_swaps_daily_volumes_mvb TO evm_swaps_daily_volumes AS
SELECT toStartOfDay(timestamp) as timestamp,
       "to"                    as account,
       token                   as token,
       sum(amount * sign)      as amount,
       sum(sign)               as count
FROM evm_erc20_transfers
GROUP BY timestamp, token, "to";

--  5 min resolution for last N day

CREATE TABLE IF NOT EXISTS evm_swaps_5m_volumes
(
    timestamp DateTime CODEC (DoubleDelta, ZSTD),
    account   String,
    token     String,
    count     UInt32,
    amount    Int128
) ENGINE = SummingMergeTree()
    ORDER BY (timestamp, token, account)
    TTL timestamp + INTERVAL 30 DAY;

CREATE MATERIALIZED VIEW IF NOT EXISTS evm_swaps_5m_volumes_mva TO evm_swaps_5m_volumes AS
SELECT toStartOfFiveMinutes(timestamp) as timestamp,
       "from"                          as account,
       token                           as token,
       sum(-amount * sign)             as amount,
       sum(sign)                       as count
FROM evm_erc20_transfers
GROUP BY timestamp, token, "from";

CREATE MATERIALIZED VIEW IF NOT EXISTS evm_swaps_5m_volumes_mvb TO evm_swaps_5m_volumes AS
SELECT toStartOfFiveMinutes(timestamp) as timestamp,
       "to"                            as account,
       token                           as token,
       sum(amount * sign)              as amount,
       sum(sign)                       as count
FROM evm_erc20_transfers
GROUP BY timestamp, token, "to";