import { PortalClient } from '@subsquid/portal-client';
import { Logger as PinoLogger, pino } from 'pino';
import { Progress } from './progress';

type Logger = PinoLogger;

export type BlockRef = {
  number: number;
  hash: string;
};

export type TransactionRef = {
  id: string;
  index: number;
};

export type Offset = string;

export type StreamOptions<Args extends {}, ProgressArgs extends any[]> = {
  portal: PortalClient;
  progress?: Progress<ProgressArgs>;
  logger?: Logger;
} & Args;

export abstract class AbstractStream<
  Args extends {},
  Res extends { offset: Offset },
  ProgressArgs extends any[] = any[],
> {
  logger: Logger;

  constructor(public readonly options: StreamOptions<Args, ProgressArgs>) {
    this.logger =
      options.logger ||
      pino({base: null, messageKey: 'message', level: process.env.LOG_LEVEL || 'info'});
  }

  abstract stream(): Promise<ReadableStream<Res[]>>;

  ack(batch: Res[], ...args: ProgressArgs): Promise<unknown> {
    if (!this.options.progress) {
      throw new Error('State is not defined. Please set the state in the stream options.');
    }

    const last = batch[batch.length - 1].offset;

    return this.options.progress.saveOffset(last, ...args);
  }

  encodeOffset(offset: any): Offset {
    return JSON.stringify(offset);
  }

  // TODO: add validation
  decodeOffset<T>(offset: Offset): T {
    return JSON.parse(offset);
  }

  async getOffset<T>(defaultValue: T): Promise<T> {
    const fromState = this.options.progress ? await this.options.progress.getOffset() : null;
    if (fromState) {
      return this.decodeOffset(fromState);
    }

    return defaultValue;
  }
}
