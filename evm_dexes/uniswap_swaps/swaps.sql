CREATE TABLE IF NOT EXISTS uniswap_v3_swaps_raw_v2
(
    timestamp         DateTime CODEC (DoubleDelta, ZSTD),
    factory_address   LowCardinality(String),
    network           LowCardinality(String),
    token_a           String,
    token_b           String,
    amount_a          Float64,
    amount_b          Float64,
    account           String,
    block_number      UInt32 CODEC (DoubleDelta, ZSTD),
    transaction_index UInt16,
    log_index         UInt16,
    transaction_hash  String,
    sign              Int8
) ENGINE = CollapsingMergeTree(sign)
      PARTITION BY toYYYYMM(timestamp) -- DATA WILL BE SPLIT BY MONTH
      ORDER BY (timestamp, transaction_index, log_index);



-- ############################################################################################################
--
-- ############################################################################################################

CREATE MATERIALIZED VIEW IF NOT EXISTS eth_amounts_mv
(
    timestamp DateTime,
    network LowCardinality(String),
    eth_amount Float64,
    usdc_amount Float64
) ENGINE SummingMergeTree() ORDER BY (timestamp, network) POPULATE
AS
SELECT toStartOfMinute(timestamp),
       network,
       CASE
           WHEN token_a IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
               THEN abs(amount_a) * sign
           ELSE abs(amount_b) * sign
           END as eth_amount,
       CASE
           WHEN token_a IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
               THEN abs(amount_b) * sign
           ELSE abs(amount_a) * sign
           END as usdc_amount
from uniswap_v3_swaps_raw_v2
WHERE (
    token_a IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
        AND token_b IN ('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
    )
   OR (
    token_b IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
        AND token_a IN ('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
    );
--

CREATE MATERIALIZED VIEW IF NOT EXISTS base_eth_prices_mv
(
    timestamp DateTime,
    network LowCardinality(String),
    token String,
    price Float64,
    sign Int8
) ENGINE CollapsingMergeTree(sign) ORDER BY (timestamp, token, network) POPULATE
AS
SELECT timestamp,
       network,
       CASE
           WHEN token_a IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
               THEN token_b
           ELSE token_a
           END as token,
       CASE
           WHEN token_a IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
               THEN abs(amount_b / amount_a)
           ELSE abs(amount_a / amount_b)
           END as price,
       sign
from uniswap_v3_swaps_raw_v2
WHERE token_a IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
   OR token_b IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2');

-- ############################################################################################################
--
-- ############################################################################################################

CREATE TABLE IF NOT EXISTS evm_token_daily_swaps_volumes
(
    timestamp DateTime,
    account   String,
    token     String,
    count     UInt32,
    amount    Float64
) ENGINE = SummingMergeTree() ORDER BY (timestamp, token, account);

CREATE MATERIALIZED VIEW IF NOT EXISTS evm_token_daily_swaps_volumes_mva TO evm_token_daily_swaps_volumes AS
SELECT toStartOfFiveMinutes(timestamp)                  as timestamp,
       account,
       token_a                                  as token,
       sum(amount_a * sign) as amount,
       sum(sign) as count
FROM uniswap_v3_swaps_raw_v2
GROUP BY timestamp, token, account;

CREATE MATERIALIZED VIEW IF NOT EXISTS evm_token_daily_swaps_volumes_mvb TO evm_token_daily_swaps_volumes AS
SELECT toStartOfDay(timestamp)                  as timestamp,
       account,
       token_b                                  as token,
       sum(amount_b * sign) as amount,
       sum(sign) as count
FROM uniswap_v3_swaps_raw_v2
GROUP BY timestamp, token, account;