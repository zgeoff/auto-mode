import { mock } from 'bun:test';

export interface StubStopSignals {
  readonly subscribeToStopSignals: ReturnType<typeof mock<(onStop: () => void) => () => void>>;
  readonly unsubscribe: ReturnType<typeof mock<(onStop: () => void) => void>>;
  readonly stop: () => void;
}

export function buildStubStopSignals(): StubStopSignals {
  const listeners = new Set<() => void>();

  const unsubscribe = mock((onStop: () => void) => {
    listeners.delete(onStop);
  });

  return {
    subscribeToStopSignals: mock((onStop: () => void) => {
      listeners.add(onStop);

      return () => {
        unsubscribe(onStop);
      };
    }),
    unsubscribe,
    stop: () => {
      for (const onStop of listeners) {
        onStop();
      }
    },
  };
}
