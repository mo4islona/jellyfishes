import { PortalClient } from '@subsquid/portal-client';
import { Throttler } from '@subsquid/util-internal';
import { BlockRef } from './abstract_stream';

type Progress = {
  blocks: {
    head: number;
    current: number;
    percent_done: number;
  };
  interval: {
    processed: number;
    speed: string;
  };
};

export type TrackProgressOptions = {
  portal: PortalClient;
  intervalSeconds?: number;
  onProgress: (progress: Progress) => void;
};

export class TrackProgress<Data = never> {
  first?: { block: BlockRef; ts: number };
  last: { block: BlockRef; ts: number };
  current: { block: BlockRef; ts: number };
  interval?: NodeJS.Timeout;

  constructor(private options: TrackProgressOptions) {
  }

  track(block: BlockRef, data?: Data) {
    if (!this.first) {
      this.first = {block, ts: Date.now()};
    }
    this.current = {block, ts: Date.now()};

    if (this.interval) return;

    const headCall = new Throttler(() => portal.getFinalizedHeight(), 60_000);
    const {portal, intervalSeconds = 5, onProgress} = this.options;

    this.interval = setInterval(async () => {
      if (!this.current || !this.first) return;

      const head = await headCall.get();

      const processed = this.last ? this.current.block.number - this.last.block.number : 0;
      const elapsed = this.last ? (Date.now() - this.last.ts) / 1000 : 0;
      const speed =
        processed && elapsed ? `${Math.floor(processed / elapsed)} blocks/sec` : 'unknown';

      const diffFromStart = this.current.block.number - this.first.block.number;
      const diffToEnd = head - this.first.block.number;

      onProgress({
        blocks: {
          head,
          current: this.current.block.number,
          percent_done: (diffFromStart / diffToEnd) * 100,
        },
        interval: {
          processed,
          speed,
        },
      });

      this.last = this.current;
    }, intervalSeconds * 1000);
  }
}
