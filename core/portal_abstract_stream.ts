import {
  PortalClient,
  PortalClientOptions,
  PortalQuery,
  PortalResponse,
  PortalStreamData,
} from '@subsquid/portal-client';
import { Throttler } from '@subsquid/util-internal';
import { Logger as PinoLogger, pino } from 'pino';
import { formatNumber } from '../pipes/utils';
import { State } from './state';
import { Progress, TrackProgress } from './track_progress';

export type Logger = PinoLogger;

export type BlockRef = {
  number: number;
  hash: string;
};

export type TransactionRef = {
  hash: string;
  index: number;
};

export type StreamOptions<Args extends object | undefined> = {
  portal: string | PortalClientOptions;
  blockRange: {
    from: number | string;
    to?: number | string;
  };
  state?: State;
  logger?: Logger;
  args?: Args;
  onProgress?: (progress: Progress) => Promise<unknown> | unknown;
  onStart?: (state: {
    state?: State;
    current: Offset;
    initial: Offset;
    resume: boolean;
  }) => Promise<unknown> | unknown;
} & (Args extends object ? { args: Args } : { args?: never });

const logged = new Map();

export type Offset = {
  timestamp: number;
  number: number;
  hash: string;
};

export type OptionalArgs<T> = T | undefined;

function parseBlockNumber(block: number | string) {
  if (typeof block === 'string') {
    /**
     * Remove commas and underscores
     * 1_000_000 -> 1000000
     * 1,000,000 -> 1000000
     */
    const value = Number(block.replace(/[_,]/g, ''));
    if (isNaN(value)) {
      throw new Error(
        `Can't parse a block number from string "${block}". Valid examples: "1000000", "1_000_000", "1,000,000"`,
      );
    }

    return value;
  }

  return block;
}

export abstract class PortalAbstractStream<
  Res extends {},
  Args extends object | undefined = undefined,
> {
  logger: Logger;
  progress?: TrackProgress;

  protected readonly portal: PortalClient;

  private offset: Offset;
  private readonly getLatestOffset: () => Promise<Offset>;

  protected fromBlock: number;
  protected toBlock: number | undefined;

  constructor(protected readonly options: StreamOptions<Args>) {
    this.logger =
      options.logger ||
      pino({ base: null, messageKey: 'message', level: process.env.LOG_LEVEL || 'info' });

    this.portal = new PortalClient(
      typeof options.portal === 'string'
        ? {
            url: options.portal,
            http: {
              retryAttempts: 10,
            },
          }
        : {
            ...options.portal,
            http: {
              retryAttempts: 10,
              ...options.portal.http,
            },
          },
    );

    // Throttle the head call
    const headCall = new Throttler(() => this.portal.getHead(), 60_000);

    this.fromBlock = parseBlockNumber(this.options.blockRange.from);
    this.toBlock = this.options.blockRange.to
      ? parseBlockNumber(this.options.blockRange.to)
      : undefined;

    // Get the latest offset
    this.getLatestOffset = async () => {
      if (this.toBlock) {
        return {
          number: this.toBlock,
          hash: '',
          timestamp: 0,
        };
      }

      const latest = await headCall.get();
      return {
        number: latest?.number || 0,
        hash: latest?.hash || '',
        // FIXME extract timestamp from the block?
        timestamp: 0,
      };
    };

    // Inherit logger to the state
    if (this.options.state && !this.options.state.logger) {
      this.options.state.setLogger(this.logger);
    }

    if (!this.options.onStart) {
      this.options.onStart = async ({ current, resume }) => {
        if (!resume) {
          this.logger.info(`Syncing from ${formatNumber(current.number)}`);
          return;
        }

        const producedAt = new Date(current.timestamp * 1000).toLocaleString('en-GB', {
          dateStyle: 'medium',
          timeStyle: 'long',
        });
        this.logger.info(
          `Resuming from ${formatNumber(current.number)} block produced at ${producedAt}`,
        );
      };
    }

    if (!this.options.onProgress) {
      this.options.onProgress = ({ state, interval }) => {
        this.logger.info({
          message: `${formatNumber(state.current)} / ${formatNumber(state.last)} (${formatNumber(state.percent)}%)`,
          speed: `${interval.processedPerSecond} blocks/second`,
        });
      };
    }

    // Probably, not the best design, but it works for now
    this.initialize();
  }

  initialize() {}

  abstract stream(): Promise<ReadableStream<Res[]>>;

  warnOnlyOnce(message: string) {
    if (logged.has(message)) return;

    this.logger.warn(message);

    logged.set(message, true);
  }

  // FIXME types
  /**
   * Fetches the stream of data from the portal.
   *
   * This method retrieves a stream of data from the portal based on the provided query.
   * It resumes streaming from the last saved offset and exits when the stream is completed.
   *
   * @param req - The query object containing the parameters for the stream request.
   * @returns A promise that resolves to a ReadableStream of the portal stream data.
   */
  async getStream<
    Res extends PortalResponse & {
      header: { number: number; hash: string; timestamp: number };
    },
    Query extends Omit<PortalQuery, 'fromBlock' | 'toBlock'> & {
      fields: { block: { number: boolean; hash: boolean; timestamp: boolean } };
    },
  >(req: Query): Promise<ReadableStream<PortalStreamData<Res>>> {
    // Get the last offset from the state
    const { current, initial, resume } = await this.getState({
      number: this.fromBlock,
    } as Offset);

    this.options.onStart?.({
      state: this.options.state,
      current,
      initial,
      resume,
    });

    if (this.options.onProgress) {
      this.progress = new TrackProgress<Offset>({
        getLatestOffset: this.getLatestOffset,
        onProgress: this.options.onProgress,
        initial,
      });
    }

    await this.options.state?.onStateRollback?.(current);

    // Ensure required block fields are present
    req.fields = {
      ...req.fields,
      block: {
        ...req.fields.block,
        number: true,
        hash: true,
        timestamp: true,
      },
    };

    const source = this.portal.getStream<Query, Res>({
      ...req,
      fromBlock: current.number,
      toBlock: this.toBlock,
    });

    return source.pipeThrough(
      new TransformStream({
        transform: (data, controller) => {
          const lastBlock = data.blocks[data.blocks.length - 1];

          this.offset = {
            number: lastBlock.header.number,
            hash: lastBlock.header.hash,
            timestamp: lastBlock.header.timestamp,
          };

          controller.enqueue(data);

          // Check if the stream is completed
          if (source[PortalClient.completed]) {
            this.stop();
          }
        },
      }),
    );
  }

  /**
   * Fetches the current state of the stream.
   *
   * This method retrieves the last offset from the state, initializes progress tracking,
   * and calls the onStart callback with the current and initial offsets.
   *
   * @param defaultValue - The default offset value to use if no state is found.
   * @returns The current offset.
   */
  async getState(
    defaultValue: Offset,
  ): Promise<{ current: Offset; initial: Offset; resume: boolean }> {
    // Fetch the last offset from the state
    const state = this.options.state ? await this.options.state.getOffset(defaultValue) : null;
    if (!state) {
      return { current: defaultValue, initial: defaultValue, resume: false };
    }

    return { ...state, resume: true };
  }

  /**
   * Acknowledge the last offset.
   *
   * This method is called to acknowledge the last processed offset in the stream.
   * It updates the progress tracking and saves the last offset to the state.
   *
   * @param args - Additional arguments passed to the state saveOffset method.
   */
  async ack<T extends any[]>(...args: T) {
    // Calculate progress and speed
    this.progress?.track(this.offset);

    if (!this.options.state) {
      this.warnOnlyOnce(
        [
          '====================================',
          'State is not defined. Please set a state to make a stream resumable',
          '====================================',
        ].join('\n'),
      );

      return;
    }

    // Save last offset
    return this.options.state.saveOffset(this.offset, ...args);
  }

  stop() {
    this.progress?.stop();

    this.logger.info(`Stream stopped`);
  }
}
