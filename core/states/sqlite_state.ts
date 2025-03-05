import { Offset } from '../abstract_stream';
import { AbstractState, State } from '../state';
import { DatabaseSync, StatementSync } from 'node:sqlite';

type Options = { id?: string; table: string };

export class SqliteState extends AbstractState implements State {
  options: Required<Options>;
  statements: Record<'update' | 'select', StatementSync>;

  constructor(
    private client: DatabaseSync,
    options: Options,
  ) {
    super();

    this.options = {
      id: 'stream',
      ...options,
    };

    try {
      this.prepare();
    } catch (e) {
      if (e instanceof Error && e.message.includes('no such table')) {
        this.client.exec(`
            CREATE TABLE IF NOT EXISTS ${this.options.table}
            (
                id      TEXT PRIMARY KEY,
                initial TEXT,
                current TEXT
            )
        `);

        this.prepare();
        return;
      }

      throw e;
    }
  }

  prepare() {
    this.statements = {
      update: this.client.prepare(`
          UPDATE "${this.options.table}"
          SET "current" = ?
          WHERE "id" = ?
      `),
      select: this.client.prepare(`
          SELECT *
          FROM ${this.options.table}
          WHERE id = ?
      `),
    };
  }

  async saveOffset(offset: Offset) {
    this.statements.update.run(offset, this.options.id);
  }

  async getOffset(defaultValue: Offset) {
    try {
      const row = this.statements.select.get(this.options.id) as
        | { initial: string; current: string }
        | undefined;

      if (!row) {
        await this.saveOffset(defaultValue);

        return {current: defaultValue, initial: defaultValue};
      }

      return {current: row.current, initial: row.initial};
    } catch (e: unknown) {
      await this.saveOffset(defaultValue);

      return {current: defaultValue, initial: defaultValue};
    }
  }
}
