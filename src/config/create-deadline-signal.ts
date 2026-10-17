import { toTimerDelay } from './to-timer-delay.ts';
import type { KeyOptions } from './types.ts';

// The signal aborts at the step's own limit or at the shared deadline,
// whichever comes first, and when the caller cancels. A deadline already
// passed or a caller already cancelled leaves no time to start the step.
export function createDeadlineSignal(
  limitMs: number,
  options: Readonly<KeyOptions>,
): AbortSignal | null {
  const remainingMs =
    options.deadlineAt === undefined ? limitMs : options.deadlineAt - options.runtime.now();

  if (remainingMs <= 0 || options.signal?.aborted === true) {
    return null;
  }

  const timer = options.runtime.timeout(toTimerDelay(Math.min(limitMs, remainingMs)));

  return options.signal === undefined ? timer : AbortSignal.any([timer, options.signal]);
}
