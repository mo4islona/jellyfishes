CREATE TABLE IF NOT EXISTS evm_swaps_raw
(
    timestamp           DateTime CODEC (DoubleDelta, ZSTD),
    factory_address     LowCardinality(String),
    network             LowCardinality(String),
    dex_name            LowCardinality(String),
    protocol            LowCardinality(String),
    token_a             String,
    token_b             String,
    amount_a_raw        Int128,
    amount_b_raw        Int128,
    amount_a            Float64,
    amount_b            Float64,
    account             String,
    block_number        UInt32 CODEC (DoubleDelta, ZSTD),
    transaction_index   UInt16,
    log_index           UInt16,
    transaction_hash    String,
    sign                Int8
) ENGINE = CollapsingMergeTree(sign)
      PARTITION BY toYYYYMM(timestamp) -- DATA WILL BE SPLIT BY MONTH
      ORDER BY (timestamp, transaction_index, log_index);

-- ############################################################################################################
--
-- ############################################################################################################

-- Materialized view that transforms swap data using token information from evm_tokens
-- TODO: slow to create, consider refactoring.
CREATE MATERIALIZED VIEW IF NOT EXISTS evm_swaps_raw_transformed_mv
(
    timestamp           DateTime CODEC (DoubleDelta, ZSTD),
    factory_address     LowCardinality(String),
    network             LowCardinality(String),
    dex_name            LowCardinality(String),
    protocol            LowCardinality(String),
    token_a             String,
    token_b             String,
    amount_a_raw        Int128,
    amount_b_raw        Int128,
    amount_a            Float64,
    amount_b            Float64,
    account             String,
    block_number        UInt32 CODEC (DoubleDelta, ZSTD),
    transaction_index   UInt16,
    log_index           UInt16,
    transaction_hash    String,
    sign                Int8
) ENGINE = MergeTree()
      PARTITION BY toYYYYMM(timestamp)
      ORDER BY (timestamp, transaction_index, log_index)
      POPULATE
AS
SELECT 
    sr.timestamp,
    sr.factory_address,
    sr.network AS network,
    sr.dex_name,
    sr.protocol,
    sr.token_a,
    sr.token_b,
    sr.amount_a_raw,
    sr.amount_b_raw,
    -- Recalculate amount_a using token_a decimals from evm_tokens if available
    CASE 
        WHEN token_a_info.decimals IS NOT NULL AND token_a_info.decimals > 0
        THEN sr.amount_a_raw / pow(10, token_a_info.decimals)
        ELSE sr.amount_a
    END AS amount_a,
    -- Recalculate amount_b using token_b decimals from evm_tokens if available
    CASE 
        WHEN token_b_info.decimals IS NOT NULL AND token_b_info.decimals > 0
        THEN sr.amount_b_raw / pow(10, token_b_info.decimals)
        ELSE sr.amount_b
    END AS amount_b,
    sr.account,
    sr.block_number,
    sr.transaction_index,
    sr.log_index,
    sr.transaction_hash,
    sr.sign
FROM evm_swaps_raw AS sr
LEFT JOIN evm_tokens AS token_a_info ON sr.token_a = token_a_info.token_address AND sr.network = token_a_info.network
LEFT JOIN evm_tokens AS token_b_info ON sr.token_b = token_b_info.token_address AND sr.network = token_b_info.network;

-- Amount of ETH and USDC swapped for each minute (we can calculate price then).
CREATE MATERIALIZED VIEW IF NOT EXISTS evm_eth_amounts_mv
(
    timestamp DateTime CODEC (DoubleDelta, ZSTD),
    network LowCardinality(String),
    eth_amount Float64,
    usdc_amount Float64
) ENGINE SummingMergeTree()
    ORDER BY (timestamp, network)
    TTL timestamp + INTERVAL 360 DAY
    POPULATE
AS
SELECT toStartOfMinute(timestamp) as timestamp,
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
from evm_swaps_raw_transformed_mv
WHERE (
    token_a IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
        AND token_b IN ('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
    )
   OR (
    token_b IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
        AND token_a IN ('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
    );
--

-- Price of tokens in ETH for each data point (each token <-> WETH swap).
CREATE MATERIALIZED VIEW IF NOT EXISTS evm_prices_token_eth_mv
(
    timestamp DateTime CODEC (DoubleDelta, ZSTD),
    network LowCardinality(String),
    token_address String,
    price_token_eth Float64,
    sign Int8
) ENGINE CollapsingMergeTree(sign)
    ORDER BY (timestamp, token_address, network)
    TTL timestamp + INTERVAL 360 DAY
    POPULATE
AS
SELECT timestamp,
       network,
       CASE
           WHEN token_a IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
               THEN token_b
           ELSE token_a
           END as token_address,
       CASE
           WHEN token_a IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
               THEN abs(amount_a / amount_b)
           ELSE abs(amount_b / amount_a)
           END as price_token_eth,
       sign
from evm_swaps_raw_transformed_mv
WHERE token_a IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
   OR token_b IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2');


-- Materialized view that duplicates each swap row with token_a and token_b swapped
-- TODO: slow to create, consider refactoring.
CREATE MATERIALIZED VIEW IF NOT EXISTS evm_swaps_raw_dupl_mv
(
    timestamp           DateTime CODEC (DoubleDelta, ZSTD),
    factory_address     LowCardinality(String),
    network             LowCardinality(String),
    dex_name            LowCardinality(String),
    protocol            LowCardinality(String),
    token_a             String,
    token_b             String,
    amount_a_raw        Int128,
    amount_b_raw        Int128,
    amount_a            Float64,
    amount_b            Float64,
    account             String,
    block_number        UInt32 CODEC (DoubleDelta, ZSTD),
    transaction_index   UInt16,
    log_index           UInt16,
    transaction_hash    String,
    sign                Int8
) ENGINE = MergeTree()
      PARTITION BY toYYYYMM(timestamp)
      ORDER BY (timestamp, transaction_index, log_index)
      POPULATE
AS
-- Original rows
SELECT 
    timestamp,
    factory_address,
    network,
    dex_name,
    protocol,
    token_a,
    token_b,
    amount_a_raw,
    amount_b_raw,
    amount_a,
    amount_b,
    account,
    block_number,
    transaction_index,
    log_index,
    transaction_hash,
    sign
FROM evm_swaps_raw_transformed_mv

UNION ALL

-- Duplicated rows with token_a and token_b swapped
SELECT 
    timestamp,
    factory_address,
    network,
    dex_name,
    protocol,
    sr.token_b AS token_a,         -- Swap token_a and token_b
    sr.token_a AS token_b,
    sr.amount_b_raw AS amount_a_raw, -- Swap amount_a and amount_b
    sr.amount_a_raw AS amount_b_raw,
    sr.amount_b AS amount_a,
    sr.amount_a AS amount_b,
    account,
    block_number,
    transaction_index,
    log_index,
    transaction_hash,
    sign
FROM evm_swaps_raw_transformed_mv as sr;


/*
 * Solution idea:
 * 1. need to calc volumes traded. Each swap – consists of 2 tokens and it creates 2 volume records – one of token_a, 
 * 	other of token_b (MV evm_swaps_raw_dupl_mv)
 * 2. we go thru rows of evm_swaps_raw_dupl_mv and calculate usd_price for token_a.
 * It will allow us to calculate volume later (we know price_token_a and amount_a)
 * 
 TODO: optimize if possible, slow.
*/	
CREATE MATERIALIZED VIEW IF NOT EXISTS evm_swap_parts_with_prices_mv
(
    timestamp DateTime CODEC (DoubleDelta, ZSTD),
    network 		LowCardinality(String),
    dex_name		LowCardinality(String),
    token_a		 	String,
    price_token_a_usd Float64,
    price_token_a_eth Float64,
    price_eth_usd	Float64,
    swap_type		String,
    token_b             String,
    amount_a_raw        Int128,
    amount_b_raw        Int128,
    amount_a            Float64,
    amount_b            Float64,
    account             String,
    block_number        UInt32 CODEC (DoubleDelta, ZSTD),
    transaction_index   UInt16,
    log_index           UInt16,
    transaction_hash    String,
    sign 			Int8
) ENGINE MergeTree()
    ORDER BY (timestamp, token_a, dex_name, network)
    TTL timestamp + INTERVAL 360 DAY
    POPULATE
AS
	-- token_a is USDC
	SELECT timestamp,
		network,
		dex_name,
		token_a,
	   	1 AS price_token_usd,
		0 AS price_token_eth,
		0 AS price_eth_usd,
		'usdc-*' AS swap_type,
	    token_b, amount_a_raw, amount_b_raw, amount_a, amount_b,  account,
	    block_number, transaction_index, log_index, transaction_hash,
	    sign
	FROM evm_swaps_raw_dupl_mv
	WHERE token_a IN ('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
	
	UNION ALL
	
	-- token_b is USDC
	SELECT timestamp,
		network,
		dex_name,
		token_a,
	   	ABS(amount_b / amount_a) AS price_token_usd,
		0 AS price_token_eth,
		0 AS price_eth_usd,
		'*-usdc' AS swap_type,
	    token_b, amount_a_raw, amount_b_raw, amount_a, amount_b,  account,
	    block_number, transaction_index, log_index, transaction_hash,
	    sign
	FROM evm_swaps_raw_dupl_mv
	WHERE token_b IN ('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')

	UNION ALL
	
	-- token_a is WETH and token_b is not USDC
	WITH prices_eth_usdc_every_minute AS (
		SELECT timestamp, sum(usdc_amount) / sum(eth_amount) as price_eth_usdc
		FROM evm_eth_amounts_mv GROUP BY timestamp
	)
	SELECT timestamp,
		network,
		dex_name,
		token_a,
	    price_eth_usd as price_token_a_usd,
	    1 AS price_token_a_eth,
	    pem.price_eth_usdc AS price_eth_usd,
	    'weth-!usdc' AS swap_type,
	    token_b, amount_a_raw, amount_b_raw, amount_a, amount_b,  account,
	    block_number, transaction_index, log_index, transaction_hash,
	    sign
	FROM evm_swaps_raw_dupl_mv esr
		LEFT JOIN prices_eth_usdc_every_minute pem ON pem.timestamp = toStartOfMinute(esr.`timestamp`)
	WHERE token_a IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
		AND token_b NOT IN ('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
	
	UNION ALL
	-- token_a is not WETH/USDC, token_b is WETH
	WITH prices_eth_usdc_every_minute AS (
		SELECT timestamp, sum(usdc_amount) / sum(eth_amount) as price_eth_usdc
		FROM evm_eth_amounts_mv GROUP BY timestamp
	)
	SELECT timestamp,
		network,
		dex_name,
		token_a,
	    price_token_a_eth*price_eth_usd as price_token_a_usd,
	    ABS(amount_b / amount_a) AS price_token_a_eth,
	    pem.price_eth_usdc AS price_eth_usd,
	    '!(weth|usdc)-weth' AS swap_type,
	    token_b, amount_a_raw, amount_b_raw, amount_a, amount_b,  account,
	    block_number, transaction_index, log_index, transaction_hash,
	    sign
	FROM evm_swaps_raw_dupl_mv esr
		LEFT JOIN prices_eth_usdc_every_minute pem ON pem.timestamp = toStartOfMinute(esr.`timestamp`)
	WHERE token_a NOT IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
		AND token_b IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
	
	
	UNION ALL
	
	-- token_a and token_b are not WETH/USDC
	WITH prices_eth_usdc_every_minute AS (
		SELECT timestamp, sum(usdc_amount) / sum(eth_amount) as price_eth_usdc
		FROM evm_eth_amounts_mv GROUP BY timestamp
	)
	SELECT esr.timestamp,
		esr.network,
		dex_name,
		token_a,
        price_token_eth*price_eth_usd AS price_token_a_usd,
        evm_prices_token_eth_mv.price_token_eth AS price_token_a_eth,    
        pem.price_eth_usdc AS price_eth_usd,
	    '!(weth|usdc)-!(weth|usdc)' AS swap_type,
	    token_b, amount_a_raw, amount_b_raw, amount_a, amount_b,  account,
	    block_number, transaction_index, log_index, transaction_hash,
	    esr.sign
	FROM evm_swaps_raw_dupl_mv esr
	 	-- looking back for first swap of esr.token_a to ETH
		ASOF LEFT JOIN evm_prices_token_eth_mv ON
			evm_prices_token_eth_mv.timestamp < esr.timestamp
			AND evm_prices_token_eth_mv.token_address = esr.token_a 
		LEFT JOIN prices_eth_usdc_every_minute pem ON pem.timestamp = toStartOfMinute(esr.`timestamp`)
	WHERE -- NOT WETH AND USDC
	(	token_a NOT IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
		AND token_a NOT IN ('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
	)
	AND
	(	token_b NOT IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
		AND token_b NOT IN ('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
	)

-- Materialized view that shows token volumes in USD by dex_name in 5-minute intervals
CREATE MATERIALIZED VIEW IF NOT EXISTS evm_swap_volume_usd5min_mv
(
    timestamp DateTime CODEC (DoubleDelta, ZSTD),
    network LowCardinality(String),
    dex_name LowCardinality(String),
    token_address String,
    volume_usd Float64
) ENGINE = SummingMergeTree()
    PARTITION BY toYYYYMM(timestamp)
    ORDER BY (timestamp, network, dex_name, token_address)
    TTL timestamp + INTERVAL 360 DAY
    POPULATE
AS
	SELECT 
	    toStartOfFiveMinutes(timestamp) AS timestamp,
	    network,
	    dex_name,
	    token_a AS token_address,
	    sum(ABS(amount_a * price_token_a_usd)) AS volume_usd
	FROM evm_swap_parts_with_prices_mv
	WHERE price_token_a_usd > 0
	GROUP BY 
	    timestamp,
	    network,
	    dex_name,
	    token_address
	ORDER BY timestamp

-- Materialized view that generates 5-minute candlestick data for tokens
CREATE MATERIALIZED VIEW IF NOT EXISTS evm_token_candlesticks_5min_mv
(
    timestamp DateTime CODEC (DoubleDelta, ZSTD),
    network LowCardinality(String),
    token String,
    open Float64,
    high Float64,
    low Float64,
    close Float64,
    volume Float64
) ENGINE = ReplacingMergeTree()
    PARTITION BY toYYYYMM(timestamp)
    ORDER BY (timestamp, token, network)
    TTL timestamp + INTERVAL 360 DAY
    POPULATE
AS
WITH price_points AS (
    SELECT
        toStartOfFiveMinutes(timestamp) AS interval_start,
        network,
        token_a AS token,
        price_token_a_usd AS price,
        amount_a AS amount,
        timestamp
    FROM evm_swap_parts_with_prices_mv
    WHERE price_token_a_usd < 500 AND price_token_a_usd !=0 --AND timestamp > '2025-03-18 00:00:00' AND token_a = '0xbc45647ea894030a4e9801ec03479739fa2485f0'
),
aggregated_data AS (
    SELECT
        interval_start,
        network,
        token,
        argMin(price, timestamp) AS open_price,
        max(price) AS high_price,
        min(price) AS low_price,
        argMax(price, timestamp) AS close_price,
        sum(abs(amount)) AS volume
    FROM price_points
    GROUP BY
        interval_start,
        network,
        token
)
SELECT
    interval_start AS timestamp,
    network,
    token,
    open_price AS open,
    high_price AS high,
    low_price AS low,
    close_price AS close,
    volume
FROM aggregated_data
ORDER BY timestamp, token, network;
