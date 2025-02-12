import fs from 'node:fs/promises';
import path from 'node:path';
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
    await clickhouse.command({query: table});
  }
}

export function createClickhouseClient() {
  return createClient({
    url: 'http://localhost:8123',
    password: '',
  });
}

export function toUnixTime(time: Date): number {
  return Math.floor(time.getTime() / 1000);
}
