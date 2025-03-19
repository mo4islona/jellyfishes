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
from evm_swaps_raw
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
from evm_swaps_raw
WHERE token_a IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
   OR token_b IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2');


/*
View with all swaps and their prices

 * Solution idea:
 * 1. need to calc volumes
 * 2. to calc volumes we need to calc USD amount of token swapped for *each* raw_swap
 * !!! problem !!!  not every swap is to ETH/USDC, so we somehow must price_token_eth for these points (it is 8% of swaps).
 * 3. Create MV to look back and calc USD volume for each swap!
 * 
 * evm_swaps_with_prices_mv
 * 
 * UNION 3 datasets
 *
 *	1. swaps with USD		- direct price calculation (price_token_usdc)
 *	2. swaps with WETH 		– join with evm_eth_amounts_mv and calc price_token_usdc = price_token_eth*price_eth_usdc
 *	3. swap coin to coin	- asof join back same token swap to ETH with timestamp less than current
 *	
 *	USD <-> WETH swaps – as we are not interested in USDC/WETH volumes (the goal is to find promising coins), 
 *	we must just exclude these from volume calculations, so this is done in datasets 1, 2.
 * 
*/	
CREATE MATERIALIZED VIEW IF NOT EXISTS evm_swaps_with_prices_mv
(
    timestamp DateTime CODEC (DoubleDelta, ZSTD),
    network 		LowCardinality(String),
    token_address 	String,
    price_token_usd Float64,
    price_token_eth Float64,
    price_eth_usd	Float64,
    swap_type		String,
    sign 			Int8
) ENGINE MergeTree()
    ORDER BY (timestamp, token_address, network)
    TTL timestamp + INTERVAL 360 DAY
    POPULATE
AS
	-- swaps WITH USDC - calc price_token_usdc directly
	SELECT timestamp,
	       network,
	       CASE
	           WHEN token_a IN ('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
	               THEN token_b
	           ELSE token_a
	           END as token_address,
	       CASE
	           WHEN token_a IN ('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
	               THEN abs(amount_a / amount_b)
	           ELSE abs(amount_b / amount_a)
	           END as price_token_usd,
	       0 AS price_token_eth,
	       0 AS price_eth_usd,
	       'with_usdc' AS swap_type,
	       sign
	from evm_swaps_raw
	WHERE -- USDC-something (not WETH)
	(	token_a IN ('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
		AND token_b NOT IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
	) 
	OR (
		token_b IN ('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
		AND token_a NOT IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
	)
	   	   
	UNION ALL
	
	-- swaps WITH WETH - calc price_token_usdc
	WITH prices_eth_usdc_every_minute AS (
		SELECT timestamp, sum(usdc_amount) / sum(eth_amount) as price_eth_usdc
		FROM evm_eth_amounts_mv GROUP BY timestamp
	)
	SELECT timestamp, 
       network,
       CASE
           WHEN token_a IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
               THEN token_b
           ELSE token_a
           END as token_address,
       price_token_eth*pem.price_eth_usdc as price_token_usd,
       (CASE
           WHEN token_a IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
               THEN abs(amount_a / amount_b)
           ELSE abs(amount_b / amount_a)
       END) AS price_token_eth,
       price_eth_usdc AS price_eth_usd,
       'with_weth' AS swap_type,
       sign
	FROM evm_swaps_raw esr
		LEFT JOIN prices_eth_usdc_every_minute pem ON pem.timestamp = toStartOfMinute(esr.`timestamp`)
	WHERE -- WETH-something (not USDC)
	(	token_a IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
		AND token_b NOT IN ('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
	)
	OR ( 
		token_b IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
		AND token_a NOT IN ('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
	)

	UNION ALL
	
	-- swaps b/w two coins (not WETH and USDC involved), here data is for *token_a*
	WITH prices_eth_usdc_every_minute AS (
		SELECT timestamp AS ts_inner, sum(usdc_amount) / sum(eth_amount) as price_eth_usdc
		FROM evm_eth_amounts_mv GROUP BY timestamp
	)
	SELECT esr.timestamp, 
       esr.network,
       esr.token_a AS token_address,
       price_token_eth*price_eth_usd AS price_token_usd,
       evm_prices_token_eth_mv.price_token_eth AS price_token_eth,       
       pem.price_eth_usdc AS price_eth_usd,
       'coin2coin_a' AS swap_type,
       esr.sign
	FROM evm_swaps_raw esr
	 	-- looking back for first swap of esr.token_a to ETH
		ASOF JOIN evm_prices_token_eth_mv ON
			evm_prices_token_eth_mv.timestamp < esr.timestamp
			AND evm_prices_token_eth_mv.token_address = esr.token_a 
		LEFT JOIN prices_eth_usdc_every_minute pem ON pem.ts_inner = toStartOfMinute(esr.timestamp)
	WHERE -- NOT WETH AND USDC
	(	token_a NOT IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
		AND token_a NOT IN ('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
	)
	AND
	(	token_b NOT IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
		AND token_b NOT IN ('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
	)
	
	UNION ALL
	
	-- swaps b/w two coins (not WETH and USDC involved), here data is for *token_b*
	WITH prices_eth_usdc_every_minute AS (
		SELECT timestamp AS ts_inner, sum(usdc_amount) / sum(eth_amount) as price_eth_usdc
		FROM evm_eth_amounts_mv GROUP BY timestamp
	)
	SELECT esr.timestamp, 
       esr.network,
       esr.token_b AS token_address,
       price_token_eth*price_eth_usd AS price_token_usd,
       evm_prices_token_eth_mv.price_token_eth AS price_token_eth,       
       pem.price_eth_usdc AS price_eth_usd,
       'coin2coin_b' AS swap_type,
       esr.sign
	FROM evm_swaps_raw esr
	 	-- looking back for first swap of esr.token_b to ETH
		ASOF JOIN evm_prices_token_eth_mv ON
			evm_prices_token_eth_mv.timestamp < esr.timestamp
			AND evm_prices_token_eth_mv.token_address = esr.token_b
		LEFT JOIN prices_eth_usdc_every_minute pem ON pem.ts_inner = toStartOfMinute(esr.timestamp)
	WHERE -- NOT WETH AND USDC
	(	token_a NOT IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
		AND token_a NOT IN ('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
	)
	AND
	(	token_b NOT IN ('0x4200000000000000000000000000000000000006', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
		AND token_b NOT IN ('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
	)	
