CREATE TABLE IF NOT EXISTS solana_swaps_raw
(
    timestamp         DateTime CODEC (DoubleDelta, ZSTD),
    dex               LowCardinality(String),
    token_a           String,
    token_b           String,
    a_to_b            Bool,
    amount_a          Float64,
    amount_b          Float64,
    account           String,
    block_number      UInt32,
    transaction_index UInt16,
    transaction_hash  String,
    sign              Int8
) ENGINE = CollapsingMergeTree(sign)
      PARTITION BY toYYYYMM(timestamp) -- DATA WILL BE SPLIT BY MONTH
      ORDER BY (block_number, account);

CREATE TABLE IF NOT EXISTS solana_swaps_candles_5m
(
    timestamp DateTime,
    token_a   String,
    token_b   String,
    open      Float64,
    high      Float64,
    low       Float64,
    close     Float64,
    count     UInt32,
    traders   UInt32,
    volume_b  Float64
) ENGINE = ReplacingMergeTree() ORDER BY (timestamp, token_a, token_b);

CREATE MATERIALIZED VIEW IF NOT EXISTS solana_swaps_candles_5m_mv
    TO solana_swaps_candles_5m
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

CREATE TABLE IF NOT EXISTS solana_token_volumes_daily
(
    timestamp   DateTime,
    token       String,
    base        String,
    volume      Float64,
    volume_base Float64
) ENGINE = SummingMergeTree() ORDER BY (timestamp, token, base);

CREATE MATERIALIZED VIEW IF NOT EXISTS solana_tokens_daily_mva TO solana_token_volumes_daily AS
SELECT toStartOfDay(timestamp) as timestamp,
       token_a                 as token,
       token_b                 as base,
       sum(amount_a * sign)    as volume,
       sum(amount_b * sign)    as volume_base
from solana_swaps_raw
GROUP BY timestamp, token_a, token_b;

CREATE MATERIALIZED VIEW IF NOT EXISTS solana_tokens_daily_mvb TO solana_token_volumes_daily AS
SELECT toStartOfDay(timestamp) as timestamp,
       token_b                 as token,
       token_b                 as base,
       sum(amount_b * sign)    as volume,
       sum(amount_b * sign)    as volume_base
from solana_swaps_raw
GROUP BY timestamp, token_a, token_b;

CREATE TABLE IF NOT EXISTS solana_tokens
(
    token       String,
    base        String,
    volume      Float64,
    volume_base Float64
) ENGINE = SummingMergeTree() ORDER BY (token, base);

CREATE MATERIALIZED VIEW IF NOT EXISTS solana_tokens_mv TO solana_tokens
AS
SELECT token,
       base,
       sum(volume)      as volume,
       sum(volume_base) as volume_base
FROM solana_token_volumes_daily
GROUP BY token, base;

-- ACCOUNT PORTFOLIO

CREATE TABLE IF NOT EXISTS solana_portfolio_daily
(
    timestamp DateTime,
    account   String,
    token     String,
    amount    Float64
) ENGINE = SummingMergeTree() ORDER BY (timestamp, account, token);


-- token_a  token_b  amount_a  amount_b  atob
-- TRUMP    SOL      100       1         true    |  -100 TRUMP +1 SOL
-- TRUMP    SOL      100       1         false   |  +100 TRUMP -1 SOL

CREATE MATERIALIZED VIEW IF NOT EXISTS solana_portfolio_daily_mva TO solana_portfolio_daily AS
SELECT toStartOfDay(timestamp)                  as timestamp,
       account,
       token_a                                  as token,
       sum(if(a_to_b, -1, 1) * amount_b * sign) as amount
FROM solana_swaps_raw
GROUP BY timestamp, account, token;

CREATE MATERIALIZED VIEW IF NOT EXISTS solana_portfolio_daily_mvb TO solana_portfolio_daily AS
SELECT toStartOfDay(timestamp)                  as timestamp,
       account,
       token_b                                  as token,
       sum(if(a_to_b, 1, -1) * amount_b * sign) as amount
FROM solana_swaps_raw
GROUP BY timestamp, account, token;

CREATE TABLE IF NOT EXISTS solana_portfolio
(
    account String,
    token   String,
    amount  Float64
) ENGINE = SummingMergeTree() ORDER BY (account, token);

CREATE MATERIALIZED VIEW IF NOT EXISTS solana_portfolio_mv TO solana_portfolio AS
SELECT account,
       token,
       sum(amount) as amount
FROM solana_portfolio_daily
GROUP BY account, token;
