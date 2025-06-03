import { SolanaPumpfunTokensStream } from '../../../streams/solana_pumpfun_tokens/solana_pumpfun';
import { createLogger } from '../../utils';

async function main() {
  const logger = createLogger('solana_tokens');

  const datasource = new SolanaPumpfunTokensStream({
    portal: 'https://portal.sqd.dev/datasets/solana-beta',
    blockRange: {
      from: 338227791
    },
    logger,
  });

  for await (const tokens of await datasource.stream()) {
    logger.info(`--------------`);
    tokens.map((t) => {
      logger.info(`---  ${t.data.name} (${t.data.symbol}) / ${t.accounts.mint}`);
      t.accounts.mint;
    });
    logger.info(`--------------`);
    // await datasource.ack();
  }
}

void main();
