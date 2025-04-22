CREATE TABLE IF NOT EXISTS solana_metaplex
(
    timestamp           DateTime CODEC (DoubleDelta, ZSTD),
    account             String,
    name                String,
    symbol              String,
    mint                String,
    uri                 String,
    transaction_hash    String,
    block_number        UInt32,
    is_mutable Bool
) ENGINE = ReplacingMergeTree()
      PARTITION BY toYYYYMM(timestamp)
      ORDER BY (account);
