CREATE TABLE IF NOT EXISTS solana_transfers_raw
(
    timestamp         DateTime CODEC (DoubleDelta, ZSTD),
    account           String,
    token             String,
    amount            Float32,
    block_number      UInt32,
    transaction_index UInt16,
    transaction_hash  String
) ENGINE = ReplacingMergeTree()
      PARTITION BY toYYYYMM(timestamp) -- DATA WILL BE SPLIT BY MONTH
      ORDER BY (block_number, transaction_index); -- DEDUPLICATION KEY

CREATE MATERIALIZED VIEW IF NOT EXISTS solana_portfolio_daily
            (
             timestamp DateTime,
             account String,
             token String,
             amount Float32
                ) ENGINE = ReplacingMergeTree() ORDER BY (timestamp, account, token) POPULATE
AS
SELECT toStartOfDay(timestamp) as timestamp,
       account,
       token,
       sum(amount)             as amount
FROM solana_transfers_raw
GROUP BY timestamp, account, token;

CREATE MATERIALIZED VIEW IF NOT EXISTS solana_portfolio
            (
             account String,
             token String,
             amount Float32
                ) ENGINE = ReplacingMergeTree() ORDER BY (account, token) POPULATE
AS
SELECT account,
       token,
       sum(amount) as amount
FROM solana_portfolio_daily
GROUP BY account, token;
