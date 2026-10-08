interface WaitForOptions {
  readonly timeoutMs?: number;
  readonly intervalMs?: number;
}

export async function waitFor<T>(
  read: () => Promise<T> | T,
  isDone: (value: T) => boolean,
  options: WaitForOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 2000;
  const intervalMs = options.intervalMs ?? 10;
  const deadline = performance.now() + timeoutMs;

  for (;;) {
    const value = await read();

    if (isDone(value)) {
      return value;
    }

    if (performance.now() >= deadline) {
      throw new Error(
        `condition not met within ${String(timeoutMs)}ms; last value: ${JSON.stringify(value)}`,
      );
    }

    await new Promise((resolve) => {
      setTimeout(resolve, intervalMs);
    });
  }
}
