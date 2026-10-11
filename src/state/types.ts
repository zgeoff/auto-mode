export interface LockClock {
  readonly now: () => number;
  readonly wait: (ms: number) => Promise<void>;
}
