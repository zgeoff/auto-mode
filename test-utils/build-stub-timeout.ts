import { mock } from 'bun:test';

export interface StubTimeout {
  readonly timeout: ReturnType<typeof mock<(ms: number) => AbortSignal>>;
  readonly expire: (call: number) => void;
}

// Stands in for AbortSignal.timeout: each call starts its own timer, and expire
// fires the nth call's timer (from 1) with the real timer's TimeoutError, or
// starts that timer already fired when the call has not happened yet.
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
    expire: (call) => {
      getTimer(call).abort(new DOMException('The operation timed out.', 'TimeoutError'));
    },
  };
}
