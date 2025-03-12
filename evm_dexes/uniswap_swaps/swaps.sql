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


CREATE MATERIALIZED VIEW IF NOT EXISTS eth_prices_mv
(
             timestamp DATETIME,
             network LowCardinality(String),
             price Float64,
             sign Int8
) ENGINE CollapsingMergeTree(sign) ORDER BY (timestamp, network) POPULATE
AS
SELECT timestamp,
       network,
       CASE
           WHEN token_a IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
               THEN abs(amount_b / nullIf(amount_a, 0))
           ELSE abs(amount_a / nullIf(amount_b, 0))
           END as price,
       sign
from uniswap_v3_swaps_raw_v2
WHERE (
    token_a IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
        AND token_b IN ('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
    )
   OR (
    token_b IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
        AND token_a IN ('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
    );