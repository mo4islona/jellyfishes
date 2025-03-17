CREATE TABLE IF NOT EXISTS solana_tokens
(
    timestamp           DateTime CODEC (DoubleDelta, ZSTD),
    account             String,
    transaction_hash    String,
    block_number        UInt32,
    decimals            UInt8,
    mint_authority      String
) ENGINE = ReplacingMergeTree()
      PARTITION BY toYYYYMM(timestamp)
      ORDER BY (account);
