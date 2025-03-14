SELECT timestamp,
       token_a,
       token_b,
       argMinMerge(open) as open,
       maxMerge(high)         as high,
       minMerge(low)          as low,
       argMaxMerge(close) as close,
       sumMerge(volume_b) as volume
from solana_swaps_candles_5m_mv
GROUP BY timestamp, token_a, token_b
ORDER BY timestamp ASC

CREATE MATERIALIZED VIEW IF NOT EXISTS solana_swaps_candles_daily ENGINE AggregatingMergeTree() ORDER BY (timestamp, token_a, token_b)
AS
SELECT toStartOfDay(timestamp)                     as timestamp,
       token_a,
       token_b,
       argMinState(amount_b / amount_a, timestamp) AS open,    -- no reorg support
       maxState(amount_b / amount_a)               AS high,    -- no reorg support
       minState(amount_b / amount_a)               AS low,     -- no reorg support
       argMaxState(amount_b / amount_a, timestamp) AS close,   -- no reorg support
       sumState(sign)                              AS count,   -- supports blockhain reorgs
       sumState(amount_b * sign)                   AS volume_b -- supports blockhain reorgs
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
       sum(if(a_to_b, -1, 1) * amount_a * sign) as amount
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
