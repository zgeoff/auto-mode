import { spawn } from 'node:child_process';

export interface CappedRunOptions {
  readonly signal: Readonly<AbortSignal>;
  readonly maxOutputBytes: number;
  readonly input?: string | undefined;
  readonly cwd?: string | undefined;
  readonly env?: Readonly<Record<string, string | undefined>> | undefined;
}

export interface CappedRunResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stopped: boolean;
  readonly failedToStart: boolean;
}

export function runCapped(
  file: string,
  args: readonly string[],
  options: Readonly<CappedRunOptions>,
): Promise<CappedRunResult> {
  return new Promise((resolve) => {
    const grouped = process.platform !== 'win32';

    const child = spawn(file, args, {
      detached: grouped,
      stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'ignore'],
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      ...(options.env === undefined ? {} : { env: options.env }),
    });

    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    let stopped = false;
    let exited: number | null | undefined;

    const setResult = (exitCode: number | null, failedToStart: boolean): void => {
      if (settled) {
        return;
      }

      settled = true;

      options.signal.removeEventListener('abort', stopChild);

      // A process that left the group can hold the pipe open, and an open pipe
      // keeps this process alive.
      if (stopped) {
        child.stdout?.destroy();
      }

      resolve({
        exitCode,
        stdout: stopped || failedToStart ? '' : Buffer.concat(chunks).toString('utf8'),
        stopped,
        failedToStart,
      });
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

      if (exited !== undefined) {
        setResult(exited, false);
      }
    };

    options.signal.addEventListener('abort', stopChild, { once: true });

    if (options.signal.aborted) {
      stopChild();
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stopped) {
        return;
      }

      chunks.push(chunk);

      size += chunk.length;

      if (size > options.maxOutputBytes) {
        stopChild();
      }
    });

    child.stdin?.on('error', () => {});
    child.stdin?.end(options.input);

    child.on('error', () => {
      setResult(null, !stopped);
    });

    // A grandchild that left the group can hold stdout open after the kill, so
    // a stopped run settles once the child has exited, not when stdout closes.
    child.on('exit', (code) => {
      exited = code;

      if (stopped) {
        setResult(code, false);
      }
    });

    child.on('close', (code) => {
      setResult(code, false);
    });
  });
}
