import { DatabaseSync, StatementSync } from 'node:sqlite';
import { Logger } from 'pino';
import fs from 'node:fs';
import path from 'node:path';
import { CREATE_POOLS_TABLE, INSERT_POOL } from './sql';

type RaydiumProtocol = 1;
type MeteoraProtocol = 2;

type RaydiumPoolType = 1;
type MeteoraPoolType = 2;

type Protocol = RaydiumProtocol | MeteoraProtocol;
type PoolType = RaydiumPoolType | MeteoraPoolType;

/**
 * Pool metadata type definition
 */
export type PoolMetadata = {
  lp_mint: string;
  token_a: string;
  token_b: string;
  protocol: Protocol;
  pool_type: PoolType;
  block_number: number;
  sign: number;
};

/**
 * Repository class to manage SQLite operations for pool metadata
 */
export class PoolRepository {
  private db: DatabaseSync;
  private statements: Record<string, StatementSync> = {};
  private logger: Logger;

  constructor(dbPath: string, logger: Logger) {
    this.logger = logger;

    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.initializeDatabase();
    this.prepareStatements();
  }

  private initializeDatabase(): void {
    try {
      this.db.exec(CREATE_POOLS_TABLE);
    } catch (error) {
      this.logger.error(`Error initializing database: ${error}`);
      throw error;
    }
  }

  private prepareStatements(): void {
    try {
      this.statements = {
        insertPool: this.db.prepare(INSERT_POOL),
      };
    } catch (error) {
      this.logger.error(`Error preparing statements: ${error}`);
      throw error;
    }
  }

  savePool(pool: Omit<PoolMetadata, 'sign'> & { sign?: number }): boolean {
    try {
      this.statements.insertPool.run({
        $lp_mint: pool.lp_mint,
        $token_a: pool.token_a,
        $token_b: pool.token_b,
        $protocol: pool.protocol,
        $pool_type: pool.pool_type,
        $block_number: pool.block_number,
        $sign: pool.sign ?? 1,
      });
      return true;
    } catch (error) {
      this.logger.error(`Error saving pool ${pool.lp_mint}: ${error}`);
      return false;
    }
  }

  getPool(mint: string): PoolMetadata | null {
    const result = this.db.prepare('SELECT * FROM solana_pools WHERE lp_mint = ?').get(mint);
    return result ? (result as PoolMetadata) : null;
  }

  getTokens(lpMint: string): { tokenA: string; tokenB: string } | null {
    const pool = this.getPool(lpMint);
    if (!pool) {
      return null;
    } 
    return {
      tokenA: pool.token_a,
      tokenB: pool.token_b,
    };
  }

  beginTransaction(): void {
    this.db.exec('BEGIN TRANSACTION');
  }

  commitTransaction(): void {
    this.db.exec('COMMIT');
  }

  rollbackTransaction(): void {
    this.db.exec('ROLLBACK');
  }

  close(): void {
    if (this.db) {
      this.db.close();
    }
  }
}
