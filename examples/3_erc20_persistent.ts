import { DataSource as TypeormDatabase } from 'typeorm';
import { TypeormAckArgs, TypeormState } from '../core/states/typeorm_state';
import { Erc20Stream } from '../streams/evm_erc20/erc20_stream';

async function main() {
  /**
   * Initialize and connect a Typeorm database
   */
  const db = await new TypeormDatabase({
    type: 'postgres',
    username: 'postgres',
    password: 'postgres',
    port: 6432,
  }).initialize();

  const dataSource = new Erc20Stream({
    portal: 'https://portal.sqd.dev/datasets/ethereum-mainnet',
    range: {
      from: 4634748,
      to: 15844479,
    },
    args: {
      contracts: ['0xdac17f958d2ee523a2206206994597c13d831ec7'],
    },
    /**
     *  Current streaming progress will be stored in the 'status_erc20' postgres table.
     *  The table will be created if it does not exist.
     *  If the table already exists, the last processed block will be read from it,
     *  thus allowing the process to continue from the last block.
     */
    state: new TypeormState(db, {
      table: 'status_erc20',
    }),
  });

  for await (const erc20 of await dataSource.stream()) {
    await db.transaction(async (manager) => {
      // Save the erc20 transfers to the database);
      // await manager.save([]);

      await dataSource.ack<TypeormAckArgs>(manager);
    });
  }
}

void main();
