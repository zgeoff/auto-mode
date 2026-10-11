import { runCapped } from '../process/run-capped.ts';
import { toTimerDelay } from './to-timer-delay.ts';
import type { EvaluationOptions } from './types.ts';

const KEY_COMMAND_TIMEOUT_MS = 5000;
const MAX_KEY_OUTPUT_BYTES = 65_536;

export async function readApiKeyFromCommand(
  command: string,
  options: EvaluationOptions = {},
): Promise<string | null> {
  const now = options.now ?? Date.now;

  const remainingMs =
    options.deadlineAt === undefined ? KEY_COMMAND_TIMEOUT_MS : options.deadlineAt - now();

  if (remainingMs <= 0 || options.signal?.aborted === true) {
    return null;
  }

  const timeout = options.timeout ?? ((ms: number) => AbortSignal.timeout(ms));
  const timer = timeout(toTimerDelay(Math.min(KEY_COMMAND_TIMEOUT_MS, remainingMs)));

  const result = await runCapped('/bin/sh', ['-c', command], {
    signal: options.signal === undefined ? timer : AbortSignal.any([timer, options.signal]),
    maxOutputBytes: MAX_KEY_OUTPUT_BYTES,
    env: options.host === undefined ? undefined : { HOME: options.host.home, ...options.host.env },
  });

  const key = result.stdout.trim();

  return !result.stopped && result.exitCode === 0 && key !== '' ? key : null;
}
