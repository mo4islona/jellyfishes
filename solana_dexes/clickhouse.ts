import fs from 'node:fs/promises';
import path from 'node:path';
import * as process from 'node:process';
import { ClickHouseClient, createClient } from '@clickhouse/client';
import { Logger } from '../core/abstract_stream';

export async function loadSqlFiles(directoryOrFile: string): Promise<string[]> {
  let sqlFiles: string[] = [];

  if (directoryOrFile.endsWith('.sql')) {
    sqlFiles = [directoryOrFile];
  } else {
    const files = await fs.readdir(directoryOrFile);
    sqlFiles = files
      .filter((file) => path.extname(file) === '.sql')
      .map((file) => path.join(directoryOrFile, file));
  }

  const tables = await Promise.all(sqlFiles.map((file) => fs.readFile(file, 'utf-8')));

  return tables.flatMap((table) => table.split(';').filter((t) => t.trim().length > 0));
}

export async function ensureTables(clickhouse: ClickHouseClient, dir: string) {
  const tables = await loadSqlFiles(dir);

  for (const table of tables) {
    try {
      await clickhouse.command({query: table});
    } catch (e: any) {
      console.error(`======================`);
      console.error(table.trim());
      console.error(`======================`);
      console.error(`Failed to create table: ${e.message}`);
      if (!e.message) console.error(e);

      process.exit(1);
    }
  }
}

export function createClickhouseClient() {
  const options = {
    url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
  };

  // console.log(
  //   `Connecting to Clickhouse at ${options.url} using user ${options.username} and password ${options.password ? options.password.replaceAll(/\./g, '*') : '"-"'}`,
  // );

  return createClient(options);
}

export function toUnixTime(time: Date | string | number): number {
  if (typeof time === 'string') {
    time = new Date(time).getTime();
  } else if (typeof time !== 'number') {
    time = time.getTime();
  }

  return Math.floor(time / 1000);
}

export async function cleanAllBeforeOffset(
  {clickhouse, logger}: { clickhouse: ClickHouseClient; logger: Logger },
  {
    table,
    offset,
    column,
    filter,
  }: { table: string | string[]; offset: number; column: string; filter?: string },
) {
  const tables = typeof table === 'string' ? [table] : table;

  await Promise.all(
    tables.map(async (table) => {
      // FIXME Can cause OOM
      const res = await clickhouse.query({
        query: `SELECT *
                FROM ${table} FINAL
                WHERE ${column} >= {current_offset:UInt32} ${filter ? `AND ${filter}` : ''}`,
        format: 'JSONEachRow',
        query_params: {current_offset: offset},
      });

      const rows = await res.json();
      if (rows.length === 0) {
        return;
      }

      logger.info(`Rolling back ${rows.length} rows from ${table}`);

      await clickhouse.insert({
        table,
        values: rows.map((row: any) => ({...row, sign: -1})),
        format: 'JSONEachRow',
      });
    }),
  );
}
