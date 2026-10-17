import { CLI_LIMITS } from '../../mods/auto-mode/contract/cli-limits.ts';
import { runCapped } from '../process/run-capped.ts';
import { toTimerDelay } from './to-timer-delay.ts';
import type { KeyOptions } from './types.ts';

const KEY_COMMAND_TIMEOUT_MS = CLI_LIMITS.keyCommandMs;
const MAX_KEY_OUTPUT_BYTES = 65_536;

export async function readApiKeyFromCommand(
  command: string,
  options: Readonly<KeyOptions>,
): Promise<string | null> {
  const runtime = options.runtime;

  const remainingMs =
    options.deadlineAt === undefined ? KEY_COMMAND_TIMEOUT_MS : options.deadlineAt - runtime.now();

  if (remainingMs <= 0 || options.signal?.aborted === true) {
    return null;
  }

  const timer = runtime.timeout(toTimerDelay(Math.min(KEY_COMMAND_TIMEOUT_MS, remainingMs)));

  const result = await runCapped('/bin/sh', ['-c', command], {
    signal: options.signal === undefined ? timer : AbortSignal.any([timer, options.signal]),
    maxOutputBytes: MAX_KEY_OUTPUT_BYTES,
    env: { HOME: runtime.host.home, ...runtime.host.env },
  });

  const key = result.stdout.trim();

  return !result.stopped && result.exitCode === 0 && key !== '' ? key : null;
}
