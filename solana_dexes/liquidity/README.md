# Solana DEX Liquidity Tracker

This system tracks liquidity events across multiple Solana DEX protocols (currently Raydium and Meteora). It processes on-chain data to track liquidity additions, removals, and pool initializations, storing the data in a ClickHouse database for efficient querying and analysis.

## System Components

### CLI (`cli.ts`)

The command-line interface provides the entry point for the liquidity tracking system. Key features:

- Connects to the Solana blockchain via the SQD Portal
- Manages ClickHouse database connections and table creation
- Processes liquidity events in real-time
- Supports resumable processing with state management
- Configurable block range processing with environment variables:
  - `FROM_BLOCK`: Starting block number (default: 240,000,000)
  - `TO_BLOCK`: Ending block number (optional)

### Liquidity Stream (`streams/solana_liquidity/index.ts`)

The core stream processor that:

- Tracks liquidity events from Raydium and Meteora protocols
- Handles AMM pools for both projects. In the future it will also track concentraded liquidity pools
- Maintains a local SQLite database for pool metadata
- Processes three types of events:
  - Pool initialization
  - Liquidity addition
  - Liquidity removal

### Database Schema (`liquidity.sql`)

The ClickHouse database schema consists of two main components:

1. `solana_liquidity_transactions` table:
   - Stores raw liquidity events
   - Tracks event type, protocol, pool type, amounts, and transaction details
   - Uses CollapsingMergeTree engine for efficient updates and rollbacks
   - Partitioned by month for query optimization

2. `solana_liquidity_daily` materialized view:
   - Aggregates daily liquidity statistics
   - Tracks total added/removed liquidity per token
   - Counts unique users and transaction types
   - Provides efficient access to aggregated metrics

## Usage

1. Ensure ClickHouse is running and accessible
2. Set up environment variables if needed:
   ```bash
   export FROM_BLOCK=240000000
   export TO_BLOCK=250000000  # Optional
   ```
3. Run the CLI:
   ```bash
   ts-node cli.ts
   ```

## Supported Protocols

1. Raydium
   - AMM pools
   - Supported operations: initialize, deposit, withdraw

2. Meteora
   - AMM pools
   - Supported operations: initialize, add balance/imbalance liquidity, remove liquidity

## Data Model

### Event Types
- `initialize`: Pool creation
- `add`: Liquidity addition
- `remove`: Liquidity removal

### Pool Types
- `amm`: Automated Market Maker
- `clmm`: Concentrated Liquidity Market Maker

## Monitoring and Maintenance

The system includes:
- Progress tracking with blocks/second metrics
- Error handling with rollback support
- State management for resumable processing
- Logging for debugging and monitoring