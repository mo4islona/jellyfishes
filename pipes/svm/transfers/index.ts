import { SolanaTokenTransfersStream } from '../../../streams/solana_token_transfers';
import { createLogger } from '../../utils';

async function main() {
  const logger = createLogger('solana_tokens');

  const datasource = new SolanaTokenTransfersStream({
    portal: 'https://portal.sqd.dev/datasets/solana-mainnet',
    blockRange: {
      from: 329339129,
    },
    logger,
    args: {
        wallet: "3TzDbGJ7kfTgorbXXweA21uFLQd6afxLYNTeCcim4zUk",
    }
  });

  for await (const it of await datasource.stream()) {
    logger.info(`--- balance has changed to ${it.newBalance} at ${new Date(it.timestamp * 1000).toLocaleDateString()}`)
  }
}

void main();