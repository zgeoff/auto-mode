import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import { Transform } from 'node:stream';

export interface CappedProcessOptions {
  readonly maxLineBytes: number;
  readonly cwd?: string | undefined;
  readonly env?: Readonly<Record<string, string | undefined>> | undefined;
  readonly signal?: Readonly<AbortSignal> | undefined;
}

export type CappedProcess = ChildProcess & { readonly stdin: Writable; readonly stdout: Readable };

const NEWLINE = 0x0a;

export function startCappedProcess(
  file: string,
  args: readonly string[],
  options: Readonly<CappedProcessOptions>,
): CappedProcess {
  const child = spawn(file, args, {
    stdio: ['pipe', 'pipe', 'ignore'],
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    ...(options.env === undefined ? {} : { env: options.env }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });

  let lineBytes = 0;

  const capped = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      let start = 0;
      let over = false;

      for (let end = chunk.indexOf(NEWLINE); end !== -1; end = chunk.indexOf(NEWLINE, start)) {
        over ||= lineBytes + end - start > options.maxLineBytes;
        lineBytes = 0;
        start = end + 1;
      }

      lineBytes += chunk.length - start;
      over ||= lineBytes > options.maxLineBytes;

      if (over) {
        child.kill('SIGKILL');

        done(new Error(`a line of output passed ${String(options.maxLineBytes)} bytes`));

        return;
      }

      done(null, chunk);
    },
  });

  if (child.stdout === null || child.stdin === null) {
    throw new Error('the child has no pipes');
  }

  child.stdout.pipe(capped);

  return Object.assign(child, { stdout: capped, stdin: child.stdin });
}
