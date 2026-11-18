import { mock } from 'bun:test';

export interface StubTimeout {
  readonly timeout: ReturnType<typeof mock<(timeoutMs: number) => AbortSignal>>;
  readonly emitTimeout: (call: number) => void;
}

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
    timeout: mock<(timeoutMs: number) => AbortSignal>(() => {
      calls += 1;

      return getTimer(calls).signal;
    }),
    emitTimeout: (call) => {
      // AbortSignal.timeout aborts with this TimeoutError DOMException, and code that
      // reads the reason must see what production sees.
      getTimer(call).abort(new DOMException('The operation timed out.', 'TimeoutError'));
    },
  };
}
