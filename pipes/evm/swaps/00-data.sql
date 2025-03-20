CREATE TABLE IF NOT EXISTS evm_tokens
(
    network         LowCardinality(String),
    token_address   String,
    decimals        UInt8,
    symbol          String DEFAULT '',
    name            String DEFAULT ''
) ENGINE = ReplacingMergeTree()
    ORDER BY (network, token_address);
