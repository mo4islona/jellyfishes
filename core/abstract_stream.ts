import { PortalClient, PortalClientOptions } from '@subsquid/portal-client';
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

export type StreamOptions<Args extends {}, DecodedOffset extends {}> = {
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

export abstract class AbstractStream<
  Args extends {},
  Res extends { offset: Offset },
  DecodedOffset extends { number: number } = any,
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
    const headCall = new Throttler(() => this.portal.getFinalizedHeight(), 60_000);
    this.getLatestOffset = async () => {
      return {number: await headCall.get()} as DecodedOffset;
    };
  }

  abstract stream(): Promise<ReadableStream<Res[]>>;

  async ack<T extends any[]>(batch: Res[], ...args: T) {
    if (!this.options.state) {
      this.logger.warn(
        [
          '====================================',
          'State is not defined. Please set a state to make a stream resumable',
          '====================================',
        ].join('\n'),
      );

      return;
    }

    // Get last offset
    const last = batch[batch.length - 1].offset;
    // Calculate progress and speed
    this.progress?.track(this.decodeOffset(last));
    // Save last offset
    return this.options.state.saveOffset(last, ...args);
  }

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

  encodeOffset(offset: any): Offset {
    return JSON.stringify(offset);
  }

  decodeOffset(offset: Offset): DecodedOffset {
    return JSON.parse(offset);
  }
}
