import { expect, onTestFinished, test } from 'bun:test';
import { once } from 'node:events';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { text } from 'node:stream/consumers';
import invariant from 'tiny-invariant';
import * as z from 'zod';
import { loadProcessState } from '../../test-utils/load-process-state.ts';
import { waitFor } from '../../test-utils/wait-for.ts';
import { runCapped } from './run-capped.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-run-capped-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const socketPath = join(dir, 'ready.sock');
  const report = Promise.withResolvers<string>();

  const server = createServer((socket) => {
    report.resolve(text(socket));
  });

  server.listen(socketPath);

  await once(server, 'listening');

  onTestFinished(() => {
    server.close();

    return once(server, 'close');
  });

  return { dir, socketPath, report: report.promise };
}

test('it returns the output and the exit code of the child', () => {
  expect(
    runCapped('/bin/sh', ['-c', 'printf "the output"; exit 3'], {
      signal: AbortSignal.timeout(10_000),
      maxOutputBytes: 1024,
    }),
  ).resolves.toStrictEqual({
    exitCode: 3,
    stdout: 'the output',
    stopped: false,
    failedToStart: false,
  });
});

test('it gives the child the input on stdin', () => {
  expect(
    runCapped('/bin/sh', ['-c', 'cat'], {
      signal: AbortSignal.timeout(10_000),
      maxOutputBytes: 1024,
      input: 'the input',
    }),
  ).resolves.toStrictEqual({
    exitCode: 0,
    stdout: 'the input',
    stopped: false,
    failedToStart: false,
  });
});

test('it runs the child in the given directory with the given environment alone', async () => {
  const ctx = await setupTest();

  const result = await runCapped('/bin/sh', ['-c', 'printf "%s|%s|%s" "$PWD" "$ONLY" "$HOME"'], {
    signal: AbortSignal.timeout(10_000),
    maxOutputBytes: 1024,
    cwd: ctx.dir,
    env: { ONLY: 'given' },
  });

  const dir = await realpath(ctx.dir);

  expect(result.stdout).toBe(`${dir}|given|`);
});

test('it stops a child whose output passes the cap and returns none of it', () => {
  expect(
    runCapped('/bin/sh', ['-c', 'head -c 2048 /dev/zero; sleep 30'], {
      signal: AbortSignal.timeout(10_000),
      maxOutputBytes: 1024,
    }),
  ).resolves.toStrictEqual({ exitCode: null, stdout: '', stopped: true, failedToStart: false });
});

test('it keeps output that reaches the cap exactly', async () => {
  const result = await runCapped('/bin/sh', ['-c', 'head -c 1024 /dev/zero'], {
    signal: AbortSignal.timeout(10_000),
    maxOutputBytes: 1024,
  });

  expect(result.stdout).toHaveLength(1024);
});

test('it stops a child at once when the signal has already aborted', () => {
  expect(
    runCapped('/bin/sh', ['-c', 'sleep 30; printf late'], {
      signal: AbortSignal.abort(),
      maxOutputBytes: 1024,
    }),
  ).resolves.toStrictEqual({ exitCode: null, stdout: '', stopped: true, failedToStart: false });
});

test('it settles at the abort when the child has exited and a process outside its group holds stdout', async () => {
  const ctx = await setupTest();

  const pidPath = join(ctx.dir, 'pids');

  const controller = new AbortController();

  const result = runCapped(
    '/bin/sh',
    ['-c', `setsid sleep 30 & echo "{\\"child\\":$$,\\"escaped\\":$!}" > "${pidPath}"`],
    { signal: controller.signal, maxOutputBytes: 1024 },
  );

  const report = await waitFor(
    () => readFile(pidPath, 'utf8').catch(() => ''),
    (written) => written.endsWith('}\n'),
  );

  const pids = z.object({ child: z.number(), escaped: z.number() }).parse(JSON.parse(report));

  onTestFinished(() => {
    process.kill(pids.escaped, 'SIGKILL');
  });

  // The abort comes after the child is reaped, so only the escaped process holds stdout.
  await waitFor(
    () => loadProcessState(pids.child),
    (state) => state === null,
  );

  controller.abort();

  expect(result).resolves.toStrictEqual({
    exitCode: 0,
    stdout: '',
    stopped: true,
    failedToStart: false,
  });
});

test('it reports a child that cannot start', async () => {
  const ctx = await setupTest();

  expect(
    runCapped(join(ctx.dir, 'missing'), [], {
      signal: AbortSignal.timeout(10_000),
      maxOutputBytes: 1024,
    }),
  ).resolves.toStrictEqual({ exitCode: null, stdout: '', stopped: false, failedToStart: true });
});

test('it kills the child and the processes it started when the signal aborts', async () => {
  const ctx = await setupTest();

  const helper = join(import.meta.dir, '..', '..', 'test-utils', 'run-stub-key-helper.ts');

  const controller = new AbortController();

  onTestFinished(() => {
    controller.abort();
  });

  const result = runCapped(process.execPath, [helper, ctx.socketPath], {
    signal: controller.signal,
    maxOutputBytes: 1024,
  });

  const report = await ctx.report;

  const pids = z.object({ helper: z.number(), child: z.number() }).parse(JSON.parse(report));

  const childBefore = await loadProcessState(pids.child);

  invariant(childBefore !== null, 'the child of the helper runs');

  controller.abort();

  const stopped = await result;

  // The kill returns before the kernel finishes it, so the child can still read
  // as running for a moment after the run settles.
  const childAfter = await waitFor(
    () => loadProcessState(pids.child),
    (state) => state === null || state.state === 'Z' || state.state === 'X',
  );

  expect(stopped.stopped).toBeTrue();

  expect(childAfter).toBeOneOf([
    null,
    { ...childBefore, state: 'Z' },
    { ...childBefore, state: 'X' },
  ]);
});
