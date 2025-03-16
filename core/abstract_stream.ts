import {
  PortalClient,
  PortalClientOptions,
  PortalQuery,
  PortalResponse,
  PortalStreamData,
} from '@subsquid/portal-client';
import { Throttler } from '@subsquid/util-internal';
import { Logger as PinoLogger, pino } from 'pino';
import { State } from './state';
import { Progress, TrackProgress } from './track_progress';
import { HttpClient } from '@subsquid/http-client';
export type Logger = PinoLogger;

export type BlockRef = {
  number: number;
  hash: string;
};

export type TransactionRef = {
  hash: string;
  index: number;
};

export type Offset = string;

export type StreamOptions<Args extends {}, DecodedOffset extends { number: number }> = {
  portal: string | PortalClientOptions;
  state?: State;
  logger?: Logger;
  args: Args;
  onProgress?: (progress: Progress) => Promise<unknown> | unknown;
  onStart?: (state: {
    state?: State;
    current: DecodedOffset;
    initial: DecodedOffset;
  }) => Promise<unknown> | unknown;
};

const logged = new Map();

export type BlockRange = { from: number; to?: number };

type DecodedOffset = {
  timestamp: number;
  number: number;
  hash: string;
};

export abstract class AbstractStream<Args extends {}, Res extends {}> {
  logger: Logger;
  progress?: TrackProgress;

  protected readonly portal: PortalClient;

  private offset: DecodedOffset;
  private toBlock: number | undefined;
  private readonly getLatestOffset: () => Promise<DecodedOffset>;

  constructor(protected readonly options: StreamOptions<Args, DecodedOffset>) {
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
    Query extends PortalQuery & {
      fields: { block: { number: boolean; hash: boolean; timestamp: boolean } };
    },
  >(req: Query): Promise<ReadableStream<PortalStreamData<Res>>> {
    // Get the last offset from the state
    const offset = await this.getState({ number: req.fromBlock } as DecodedOffset);

    // Rewrite the original fromBlock to the last saved offset
    req.fromBlock = offset.number;

    if (req.toBlock) {
    }
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

    const source = this.portal.getStream<Query, Res>(req);

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
  async getState(defaultValue: DecodedOffset): Promise<DecodedOffset> {
    // Fetch the last offset from the state
    const state = this.options.state
      ? await this.options.state.getOffset(this.encodeOffset(defaultValue))
      : null;

    if (!state) {
      if (this.options.onProgress) {
        this.progress = new TrackProgress<DecodedOffset>({
          getLatestOffset: this.getLatestOffset,
          onProgress: this.options.onProgress,
          initial: defaultValue,
        });
      }

      this.options.onStart?.({
        state: this.options.state,
        current: defaultValue,
        initial: defaultValue,
      });

      return defaultValue;
    }

    const current = this.decodeOffset(state.current);
    const initial = this.decodeOffset(state.initial);

    await this.options.onStart?.({
      state: this.options.state,
      current,
      initial,
    });

    if (this.options.onProgress) {
      this.progress = new TrackProgress<DecodedOffset>({
        getLatestOffset: this.getLatestOffset,
        onProgress: this.options.onProgress,
        initial,
      });
    }

    return current;
  }

  /**
   * Acknowledge the last offset.
   *
   * This method is called to acknowledge the last processed offset in the stream.
   * It updates the progress tracking and saves the last offset to the state.
   *
   * @param batch - The batch of results processed.
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
    return this.options.state.saveOffset(this.encodeOffset(this.offset), ...args);
  }

  encodeOffset(offset: DecodedOffset): Offset {
    return JSON.stringify(offset);
  }

  decodeOffset(offset: Offset): DecodedOffset {
    return {
      timestamp: 0,
      number: 0,
      hash: '',
      ...(JSON.parse(offset) || {}),
    };
  }

  stop() {
    this.progress?.stop();

    this.logger.info(`Stream stopped`);
  }
}
