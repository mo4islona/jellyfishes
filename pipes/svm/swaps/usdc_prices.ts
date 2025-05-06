import fs from 'node:fs/promises';
import { Logger as PinoLogger, pino } from 'pino';
import { SolanaSwap } from '../../../streams/solana_swaps/solana_swaps';
import { getSortFunction } from './util';

export const TRACKED_TOKENS = [
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'So11111111111111111111111111111111111111112', // SOL
];

const sortTokens = getSortFunction(TRACKED_TOKENS);

function getPrice(tokenA: any, tokenB: any) {
  const a = Number(tokenA.amount) / 10 ** tokenA.decimals;
  const b = Number(tokenB.amount) / 10 ** tokenB.decimals;

  return Math.abs(b / a);
}

export type ExtendedSolanaSwap = SolanaSwap & {
  input: {
    amount: bigint;
    mint: string;
    decimals: number;
    usdc_price: number;
  };
  output: {
    amount: bigint;
    mint: string;
    decimals: number;
    usdc_price: number;
  };
};

function isPair(swap: SolanaSwap, a: string, b: string): number {
  if (swap.input.mint === a && swap.output.mint === b) {
    return 1;
  }

  if (swap.input.mint === b && swap.output.mint === a) {
    return -1;
  }

  return 0;
}

type Price = { value: number; ts: number };
type PricesState = Record<string, Price[]>;

export class SvmUsdcAmountsAggregatorStream {
  prices: PricesState;

  constructor(
    protected options: {
      statePath: string;
      logger?: PinoLogger;
    } = {
      statePath: './prices.json',
    },
  ) {}

  async loadState() {
    try {
      const file = await fs.readFile(this.options.statePath, 'utf-8');

      this.prices = JSON.parse(file);
    } catch (e) {
      if (this.options.logger) {
        this.options.logger.warn(`Loading state error ${e}. Creating new state.`);
      }

      this.prices = {};
    }
  }

  async saveState() {
    Object.keys(this.prices).forEach((key) => {
      this.prices[key] = this.prices[key].slice(0, 100);
    });

    await fs.writeFile(this.options.statePath, JSON.stringify(this.prices));
  }

  setPrice(mint: string, price: Price) {
    if (!this.prices[mint]) {
      this.prices[mint] = [];
    }

    const current = this.prices[mint].find((p) => p.ts === price.ts);
    if (current) {
      current.value = price.value;
    } else {
      this.prices[mint].unshift(price);
    }
  }

  getLatestPrice(mint: string, ts: number): Price {
    const prices = this.prices[mint];

    if (!prices || prices.length === 0) {
      return { value: 0, ts: 0 };
    }

    // Find the latest price before the given timestamp
    const latestPrice = prices.find((price) => price.ts <= ts);
    if (latestPrice) return latestPrice;

    return prices[prices.length - 1];
  }

  async pipe(): Promise<TransformStream<SolanaSwap[], ExtendedSolanaSwap[]>> {
    await this.loadState();

    return new TransformStream({
      transform: (swaps: ExtendedSolanaSwap[], controller) => {
        for (const swap of swaps) {
          // Check if the swap is a pair of SOL and USDC
          const solUsdc = isPair(
            swap,
            'So11111111111111111111111111111111111111112',
            'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          );
          if (solUsdc === 0) continue;

          const tokenA = solUsdc > 0 ? swap.input : swap.output;
          const tokenB = solUsdc > 0 ? swap.output : swap.input;

          this.setPrice('So11111111111111111111111111111111111111112', {
            value: getPrice(tokenA, tokenB),
            ts: swap.block.timestamp,
          });
        }

        for (const swap of swaps) {
          const needTokenSwap = sortTokens(swap.input.mint, swap.output.mint);

          const tokenA = !needTokenSwap ? swap.input : swap.output;
          const tokenB = !needTokenSwap ? swap.output : swap.input;

          if (tokenB.mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') {
            tokenA.usdc_price = getPrice(tokenA, tokenB);
            tokenB.usdc_price = 1;
            continue;
          }

          if (tokenB.mint === 'So11111111111111111111111111111111111111112') {
            const solPrice = getPrice(tokenA, tokenB);

            const latestSolUsdcPrice = this.getLatestPrice(
              'So11111111111111111111111111111111111111112',
              swap.block.timestamp,
            );

            tokenA.usdc_price = latestSolUsdcPrice.value * solPrice;
            tokenB.usdc_price = solPrice;
          }
        }

        controller.enqueue(swaps);

        void this.saveState();
      },
    });
  }
}
