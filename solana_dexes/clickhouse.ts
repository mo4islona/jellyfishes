import fs from 'node:fs/promises';
import path from 'node:path';
import * as process from 'node:process';
import { ClickHouseClient, createClient } from '@clickhouse/client';

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
      process.exit(1);
    }
  }
}

export function createClickhouseClient() {
  return createClient({
    url: 'http://localhost:8123',
    password: '',
  });
}

export function toUnixTime(time: Date | string | number): number {
  if (typeof time === 'string') {
    time = new Date(time).getTime();
  } else if (typeof time !== 'number') {
    time = time.getTime();
  }

  return Math.floor(time / 1000);
}
