import { Offset } from './abstract_stream';

export interface Progress<Args extends any[] = any[]> {
  saveOffset(offset: Offset, ...args: Args): Promise<unknown>;

  getOffset(): Promise<Offset | undefined>;
}
