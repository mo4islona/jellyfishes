import { createLogger, formatNumber } from '../../../examples/utils';
import { SolanaPumpfunTokensStream } from '../../../streams/solana_pumpfun_tokens/solana_pumpfun';

async function main() {
  const logger = createLogger('solana_tokens');

  const datasource = new SolanaPumpfunTokensStream({
    portal: 'https://portal.sqd.dev/datasets/solana-mainnet',
    blockRange: {
      from: 240_000_000,
    },
    logger,
    onStart: async ({ current, initial }) => {
      if (initial.number === current.number) {
        logger.info(`Syncing from ${formatNumber(current.number)}`);
        return;
      }
      const ts = new Date(current.timestamp * 1000);

      logger.info(`Resuming from ${formatNumber(current.number)} produced ${ts.toISOString()}`);
    },
    onProgress: ({ state, interval }) => {
      logger.info({
        message: `${formatNumber(state.current)} / ${formatNumber(state.last)} (${formatNumber(state.percent)}%)`,
        speed: `${interval.processedPerSecond} blocks/second`,
      });
    },
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
