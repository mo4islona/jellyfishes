import { ClickHouseClient, ClickHouseError } from '@clickhouse/client';
import { NodeClickHouseClient } from '@clickhouse/client/dist/client';
import { Offset } from '../abstract_stream';
import { AbstractState, State } from '../state';

const table = (table: string) => `
    CREATE TABLE IF NOT EXISTS ${table}
    (
        "id"      String,
        "initial" String,
        "offset"  String
    ) ENGINE = ReplacingMergeTree()
ORDER BY (id)
`;

type Options = { database?: string; table: string; id?: string };

export class ClickhouseProgress extends AbstractState implements State {
  options: Required<Options>;
  initial?: string;

  private readonly fullTableName: string;

  constructor(
    private client: NodeClickHouseClient,
    options: { database?: string; table: string; id?: string },
  ) {
    super();

    this.options = {
      database: 'default',
      id: 'stream',
      ...options,
    };

    this.fullTableName = `"${this.options.database}"."${this.options.table}"`;
  }

  async saveOffset(offset: Offset) {
    await this.client.insert({
      table: this.options.table,
      values: [
        {
          id: this.options.id,
          initial: this.initial,
          offset: offset,
        },
      ].filter(Boolean),
      format: 'JSONEachRow',
    });
  }

  async getOffset(defaultValue: Offset) {
    try {
      const res = await this.client.query({
        query: `SELECT *
                FROM "${this.options.database}"."${this.options.table}" FINAL
                WHERE id = {id:String}
                LIMIT 1`,
        format: 'JSONEachRow',
        query_params: {id: this.options.id},
      });

      const [row] = await res.json<{ initial: string; offset: string }>();

      this.initial = row.initial;

      if (row) return {current: row.offset, initial: row.initial};

      return;
    } catch (e: unknown) {
      if (e instanceof ClickHouseError && e.type === 'UNKNOWN_TABLE') {
        await this.client.command({
          query: table(this.fullTableName),
        });

        this.initial = defaultValue;
        await this.saveOffset(defaultValue);

        return;
      }

      throw e;
    }
  }

  async cleanAllBeforeOffset(
    clickhouse: ClickHouseClient,
    {tables, offset, column}: { tables: string[]; offset: number; column: string },
  ) {
    await Promise.all(
      tables.map(async (table) => {
        const res = await clickhouse.query({
          query: `SELECT *
                  FROM ${table}
                  WHERE ${column} >= {o:String}`,
          format: 'JSONEachRow',
          query_params: {o: offset},
        });

        const rows = await res.json();
        if (rows.length === 0) return;

        console.log(`rolling back ${rows.length} rows from ${table}`);

        throw new Error('not implemented');
      }),
    );
  }
}
