import { DatabaseSync, StatementSync } from 'node:sqlite';
import { Logger } from 'pino';
import fs from 'node:fs';
import path from 'node:path';
import { CREATE_POOLS_TABLE, INSERT_POOL } from './sql';

/**
 * Pool metadata type definition
 */
export type PoolMetadata = {
  lp_mint: string;
  token_a: string;
  token_b: string;
  protocol: number; // 1 for raydium, 2 for meteora
  pool_type: number; // 1 for amm, 2 for clmm
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

  /**
   * Create a new PoolRepository
   *
   * @param dbPath Path to SQLite database file
   * @param logger Logger instance
   */
  constructor(dbPath: string, logger: Logger) {
    this.logger = logger;

    // Ensure directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Initialize database connection
    this.db = new DatabaseSync(dbPath);

    // Create tables
    this.initializeDatabase();

    // Prepare statements
    this.prepareStatements();
  }

  /**
   * Initialize database schema
   */
  private initializeDatabase(): void {
    try {
      this.db.exec(CREATE_POOLS_TABLE);
    } catch (error) {
      this.logger.error(`Error initializing database: ${error}`);
      throw error;
    }
  }

  /**
   * Prepare SQL statements
   */
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

  /**
   * Insert or update pool
   *
   * @param pool Pool metadata
   * @returns True if successful, false otherwise
   */
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

  /**
   * Begin a transaction
   */
  beginTransaction(): void {
    this.db.exec('BEGIN TRANSACTION');
  }

  /**
   * Commit a transaction
   */
  commitTransaction(): void {
    this.db.exec('COMMIT');
  }

  /**
   * Rollback a transaction
   */
  rollbackTransaction(): void {
    this.db.exec('ROLLBACK');
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
    }
  }
}
