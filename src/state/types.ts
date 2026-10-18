export interface LockClock {
  readonly now: () => number;
  readonly wait: (delayMs: number) => Promise<void>;
}
