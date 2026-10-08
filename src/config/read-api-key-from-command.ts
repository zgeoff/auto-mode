import { spawn } from 'node:child_process';
import type { EvaluationOptions } from './types.ts';

export function readApiKeyFromCommand(
  command: string,
  options: EvaluationOptions = {},
): Promise<string | null> {
  const remainingMs = options.deadlineAt === undefined ? 5000 : options.deadlineAt - Date.now();

  if (remainingMs <= 0 || options.signal?.aborted === true) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const grouped = process.platform !== 'win32';

    const child = spawn('/bin/sh', ['-c', command], {
      detached: grouped,
      stdio: ['ignore', 'pipe', 'ignore'],
      ...(options.host === undefined ? {} : { env: { ...options.host.env } }),
    });

    let output = '';
    let settled = false;
    let stopped = false;

    const setResult = (value: string | null): void => {
      if (!settled) {
        settled = true;

        clearTimeout(timer);
        options.signal?.removeEventListener('abort', stopChild);
        resolve(value);
      }
    };

    const stopChild = (): void => {
      if (stopped) {
        return;
      }

      stopped = true;

      try {
        if (grouped && child.pid !== undefined) {
          process.kill(-child.pid, 'SIGKILL');
        } else {
          child.kill('SIGKILL');
        }
      } catch {
        child.kill('SIGKILL');
      }
    };

    const timer = setTimeout(stopChild, Math.min(5000, remainingMs));

    options.signal?.addEventListener('abort', stopChild, { once: true });
    child.stdout.setEncoding('utf8');

    child.stdout.on('data', (chunk: string) => {
      if (stopped) {
        return;
      }

      output += chunk;

      if (output.length > 65_536) {
        stopChild();
      }
    });

    child.on('error', () => {
      setResult(null);
    });

    child.on('close', (code) => {
      const key = !stopped && code === 0 && output.trim() !== '' ? output.trim() : null;

      setResult(key);
    });
  });
}
