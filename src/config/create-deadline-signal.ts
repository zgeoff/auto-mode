import { toTimerDelay } from './to-timer-delay.ts';
import type { KeyOptions } from './types.ts';

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
