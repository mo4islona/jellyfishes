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

export abstract class AbstractStream<
  Args extends {},
  Res extends { offset: Offset },
  DecodedOffset extends { number: number } = { number: number },
> {
  protected readonly portal: PortalClient;
  logger: Logger;
  progress?: TrackProgress;

  private readonly getLatestOffset: () => Promise<DecodedOffset>;

  constructor(protected readonly options: StreamOptions<Args, DecodedOffset>) {
    this.logger =
      options.logger ||
      pino({base: null, messageKey: 'message', level: process.env.LOG_LEVEL || 'info'});

    this.portal = new PortalClient(
      typeof options.portal === 'string' ? {url: options.portal} : options.portal,
    );

    // Throttle the head call
    const headCall = new Throttler(() => this.portal.getHead(), 60_000);

    // Get the latest offset
    this.getLatestOffset = async () => {
      const latest = await headCall.get();

      return {number: latest?.number || 0} as DecodedOffset;
    };

    // Probably, not the best design, but it works for now
    this.initialize();
  }

  initialize() {
  }

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
  async getStream<Res extends PortalResponse, Query extends PortalQuery>(
    req: Query,
  ): Promise<ReadableStream<PortalStreamData<Res>>> {
    // Get the last offset from the state
    const offset = await this.getState({number: req.fromBlock} as DecodedOffset);

    // Rewrite the original fromBlock to the last saved offset
    req.fromBlock = offset.number;

    const source = this.portal.getStream<Query, Res>(req);

    return source.pipeThrough(
      new TransformStream({
        transform: (data, controller) => {
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
  async ack<T extends any[]>(batch: Res[], ...args: T) {
    // Get last offset
    const last = batch[batch.length - 1].offset;

    // Calculate progress and speed
    this.progress?.track(this.decodeOffset(last));

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
    return this.options.state.saveOffset(last, ...args);
  }

  encodeOffset(offset: any): Offset {
    return JSON.stringify(offset);
  }

  decodeOffset(offset: Offset): DecodedOffset {
    return JSON.parse(offset);
  }

  stop() {
    this.progress?.stop();

    this.logger.info(`Stream stopped`);
  }
}
