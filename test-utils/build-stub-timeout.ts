import { mock } from 'bun:test';

export interface StubTimeout {
  readonly timeout: ReturnType<typeof mock<(ms: number) => AbortSignal>>;
  readonly emitTimeout: (call: number) => void;
}

// AbortSignal.timeout aborts with a TimeoutError DOMException, so a stub timer
// aborts with the same reason and code that reads it sees what production sees.
export function buildStubTimeout(): StubTimeout {
  const timers = new Map<number, AbortController>();

  let calls = 0;

  const getTimer = (call: number) => {
    const existing = timers.get(call);

    if (existing !== undefined) {
      return existing;
    }

    const created = new AbortController();

    timers.set(call, created);

    return created;
  };

  return {
    timeout: mock<(ms: number) => AbortSignal>(() => {
      calls += 1;

      return getTimer(calls).signal;
    }),
    emitTimeout: (call) => {
      getTimer(call).abort(new DOMException('The operation timed out.', 'TimeoutError'));
    },
  };
}
