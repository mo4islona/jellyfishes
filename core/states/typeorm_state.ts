import { DataSource, EntityManager } from 'typeorm';
import { Offset } from '../abstract_stream';
import { AbstractState, State } from '../state';

export type TypeormAckArgs = [EntityManager];

export class TypeormState extends AbstractState implements State<TypeormAckArgs> {
  constructor(
    private db: DataSource,
    private options: { table: string; namespace?: string; id?: string },
  ) {
    super();

    this.options = {
      namespace: 'public',
      id: 'stream',
      ...options,
    };
  }

  async saveOffset(offset: Offset, manager: EntityManager) {
    await manager.query(
      `UPDATE "${this.options.namespace}"."${this.options.table}"
       SET offset = $1
       WHERE id = $3`,
      [offset, this.options.id],
    );
  }

  async getOffset() {
    try {
      const state = await this.db.query(
        `SELECT "offset"
         FROM "${this.options.namespace}"."${this.options.table}"
         WHERE id = $1
         LIMIT 1`,
        [this.options.id],
      );
      if (state.length > 0 && state[0].state > 0) {
        // FIXME save initial
        return {current: state[0].offset, initial: state[0].offset};
      }
    } catch (e: any) {
      if (e.code === '42P01') {
        await this.db.transaction(async (manager) => {
          await manager.query(
            `CREATE TABLE IF NOT EXISTS "${this.options.namespace}"."${this.options.table}"
             (
                 id     TEXT,
                 offset TEXT
             )`,
          );
          await manager.query(
            `INSERT INTO "${this.options.namespace}"."${this.options.table}" (id, offset)
             VALUES ($1, $2)`,
            [this.options.id, ''],
          );
        });

        return;
      }

      throw e;
    }

    return;
  }
}
