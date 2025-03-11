import { createLogger, formatNumber } from '../../examples/utils';
import { HttpClient } from '@subsquid/http-client';
import { SqliteState } from '../../core/states/sqlite_state';
import { DatabaseSync } from 'node:sqlite';
import { Logger } from 'pino';

export interface DexPoolCliConfig {
  network: string;
  dbPath: string;
  portal: {
    url: string;
  };
  factory: {
    block: {
      number: number;
    };
  };
}

export type Dexs = "uniswap.v3" | "aerodrome";

export class DexPoolCli {
  protected logger: Logger;
  protected db: DatabaseSync;
  protected config: DexPoolCliConfig;

  constructor(config: DexPoolCliConfig, dexName: Dexs) {
    this.config = config;
    this.logger = createLogger(`${dexName} pools`).child({ network: config.network });
    this.db = new DatabaseSync(config.dbPath);
  }

  async initialize(): Promise<void> {
    this.db.exec('PRAGMA journal_mode = WAL');
    this.logger.info(`Local database: ${this.config.dbPath}`);
  }

  protected createStreamOptions(syncStatusTable: string) {
    return {
      portal: {
        url: this.config.portal.url,
        http: new HttpClient({
          retryAttempts: 10,
        }),
      },
      args: {
        fromBlock: this.config.factory.block.number,
      },
      logger: this.logger,
      state: new SqliteState(this.db, {
        table: syncStatusTable,
        network: `pools-${this.config.network}`,
      }),
      onStart: async ({ current, initial }) => {
        if (initial.number === current.number) {
          this.logger.info(`Syncing from ${formatNumber(current.number)}`);
          return;
        }

        this.logger.info(`Resuming from ${formatNumber(current.number)}`);
      },
      onProgress: ({ state, interval }) => {
        this.logger.info({
          message: `${formatNumber(state.current)} / ${formatNumber(state.last)} (${formatNumber(state.percent)}%)`,
          speed: `${interval.processedPerSecond} blocks/second`,
        });
      },
    };
  }
} 