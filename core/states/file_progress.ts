import fs from 'node:fs/promises';
import { Offset } from '../abstract_stream';
import { Progress } from '../progress';

export class FileProgress implements Progress {
  constructor(private readonly filepath: string) {
  }

  async saveOffset(state: Offset) {
    await fs.writeFile(this.filepath, state);
  }

  async getOffset() {
    try {
      const state = await fs.readFile(this.filepath, 'utf8');
      if (state) {
        return JSON.parse(state);
      }
    } catch (e: any) {
      if (e.code !== 'ENOENT') {
        throw e;
      }
    }

    return;
  }
}
