import { ClickHouseError } from '@clickhouse/client';
import { NodeClickHouseClient } from '@clickhouse/client/dist/client';
import { Offset } from '../abstract_stream';
import { Progress } from '../progress';

const table = ({database, table}: { database: string; table: string }) => `
    CREATE TABLE IF NOT EXISTS "${database}"."${table}"
    (
        id     String,
        offset String
    ) ENGINE = ReplacingMergeTree()
ORDER BY (id)
`;

type Options = { database?: string; table: string; id?: string };

export class ClickhouseProgress implements Progress {
  options: Required<Options>;

  constructor(
    private client: NodeClickHouseClient,
    options: { database?: string; table: string; id?: string },
  ) {
    this.options = {
      database: 'default',
      id: 'stream',
      ...options,
    };
  }

  async saveOffset(offset: Offset) {
    await this.client.insert({
      table: this.options.table,
      values: [
        {
          id: this.options.id,
          offset: offset,
        },
      ].filter(Boolean),
      format: 'JSONEachRow',
    });
  }

  async getOffset() {
    try {
      const res = await this.client.query({
        query: `SELECT *
                FROM "${this.options.database}"."${this.options.table}" FINAL
                WHERE id = {id:String}
                LIMIT 1`,
        format: 'JSONEachRow',
        query_params: {id: this.options.id},
      });

      const [row] = await res.json<{ offset: string }>();

      if (row) return row.offset;

      return;
    } catch (e: unknown) {
      if (e instanceof ClickHouseError && e.type === 'UNKNOWN_TABLE') {
        await this.client.command({
          query: table(this.options),
        });

        return;
      }

      throw e;
    }
  }
}
