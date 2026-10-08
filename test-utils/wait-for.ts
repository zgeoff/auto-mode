interface WaitForClock {
  readonly now: () => number;
  readonly wait: (ms: number) => Promise<void>;
}

interface WaitForOptions {
  readonly timeoutMs?: number;
  readonly intervalMs?: number;
  readonly clock?: WaitForClock;
}

const SYSTEM_CLOCK: WaitForClock = {
  now: () => performance.now(),
  wait: (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
};

export async function waitFor<T>(
  read: () => Promise<T> | T,
  isDone: (value: T) => boolean,
  options: WaitForOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 2000;
  const intervalMs = options.intervalMs ?? 10;
  const clock = options.clock ?? SYSTEM_CLOCK;
  const deadline = clock.now() + timeoutMs;

  for (;;) {
    const value = await read();

    if (isDone(value)) {
      return value;
    }

    if (clock.now() >= deadline) {
      throw new Error(
        `condition not met within ${String(timeoutMs)}ms; last value: ${JSON.stringify(value)}`,
      );
    }

    await clock.wait(intervalMs);
  }
}
