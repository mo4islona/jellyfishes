export type Progress = {
  state: {
    initial: number;
    last: number;
    current: number;
    percent: number;
  };
  interval: {
    processedTotal: number;
    processedPerSecond: number;
  };
};

export type TrackProgressOptions<DecodedOffset> = {
  intervalSeconds?: number;
  getLatestOffset: () => Promise<DecodedOffset>;
  onProgress: (progress: Progress) => void;
  initial?: DecodedOffset;
};

export class TrackProgress<DecodedOffset extends { number: number } = any> {
  initial?: { offset: DecodedOffset; ts: number };
  last: { offset: DecodedOffset; ts: number };
  current: { offset: DecodedOffset; ts: number };
  interval?: NodeJS.Timeout;

  stopped = false;

  constructor(private options: TrackProgressOptions<DecodedOffset>) {
    if (options.initial) {
      this.initial = {offset: options.initial, ts: Date.now()};
    }
  }

  track(offset: DecodedOffset) {
    if (!this.initial) {
      this.initial = {offset, ts: Date.now()};
    }
    this.current = {offset, ts: Date.now()};

    if (this.interval || this.stopped) return;

    const {intervalSeconds = 5, onProgress} = this.options;

    this.interval = setInterval(async () => {
      if (!this.current || !this.initial) return;

      const last = await this.options.getLatestOffset();

      const processedTotal = this.last ? this.current.offset.number - this.last.offset.number : 0;
      const elapsed = this.last ? (Date.now() - this.last.ts) / 1000 : 0;
      const processedPerSecond =
        processedTotal && elapsed ? Math.floor(processedTotal / elapsed) : 0;

      const diffFromStart = this.current.offset.number - this.initial?.offset.number;
      const diffToEnd = last.number - this.initial.offset.number;

      onProgress({
        state: {
          last: last.number,
          initial: this.initial.offset.number,
          current: this.current.offset.number,
          percent: (diffFromStart / diffToEnd) * 100,
        },
        interval: {
          processedTotal,
          processedPerSecond,
        },
      });

      this.last = this.current;
    }, intervalSeconds * 1000);
  }

  stop() {
    this.stopped = true;
    clearInterval(this.interval);
  }
}
