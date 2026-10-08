import { mock } from 'bun:test';

export interface StubStopSignals {
  readonly subscribeToStopSignals: ReturnType<typeof mock<(onStop: () => void) => () => void>>;
  readonly unsubscribe: ReturnType<typeof mock<() => void>>;
  readonly stop: () => void;
}

// Stands in for the process's SIGTERM and SIGINT: stop calls every callback
// still subscribed, the way a delivered signal calls its listeners.
export function buildStubStopSignals(): StubStopSignals {
  const listeners = new Set<() => void>();

  const unsubscribe = mock(() => {
    listeners.clear();
  });

  return {
    subscribeToStopSignals: mock((onStop: () => void) => {
      listeners.add(onStop);

      return unsubscribe;
    }),
    unsubscribe,
    stop: () => {
      for (const onStop of listeners) {
        onStop();
      }
    },
  };
}
