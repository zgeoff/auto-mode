import { expect, onTestFinished, test } from 'bun:test';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { text } from 'node:stream/consumers';
import invariant from 'tiny-invariant';
import * as z from 'zod';
import { loadProcessState } from './load-process-state.ts';
import { stopProcessGroup } from './stop-process-group.ts';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-stub-key-helper-'));

  stack.defer(() => rm(dir, { recursive: true, force: true }));

  const socketPath = join(dir, 'ready.sock');
  const report = Promise.withResolvers<string>();

  const server = createServer((socket) => {
    report.resolve(text(socket));
  });

  server.listen(socketPath);

  await once(server, 'listening');

  stack.defer(async () => {
    server.close();

    await once(server, 'close');
  });

  return { socketPath, report: report.promise };
}

test('it reports its own and its running child process IDs on the socket', async () => {
  const ctx = await setupTest();

  const helper = spawn(
    process.execPath,
    [join(import.meta.dir, 'run-stub-key-helper.ts'), ctx.socketPath],
    { detached: true, stdio: 'ignore' },
  );

  invariant(helper.pid !== undefined, 'the stub started');

  const group = helper.pid;

  onTestFinished(() => {
    stopProcessGroup(group);
  });

  const body = await ctx.report;

  const report = z.object({ helper: z.number(), child: z.number() }).parse(JSON.parse(body));

  const child = await loadProcessState(report.child);

  expect(report).toStrictEqual({ helper: group, child: expect.toBeNumber() });

  // A live process can read as D (uninterruptible sleep) while it waits on I/O
  // on a loaded host, so only the zombie and dead states rule it out.
  expect(child).toStrictEqual({
    state: expect.not.toBeOneOf(['Z', 'X']),
    startTime: expect.toBeString(),
  });
});

test('it prints no key by the time it reports', async () => {
  const ctx = await setupTest();

  const helper = spawn(
    process.execPath,
    [join(import.meta.dir, 'run-stub-key-helper.ts'), ctx.socketPath],
    { detached: true, stdio: ['ignore', 'pipe', 'ignore'] },
  );

  invariant(helper.pid !== undefined, 'the stub started');

  const group = helper.pid;

  onTestFinished(() => {
    stopProcessGroup(group);
  });

  const output = text(helper.stdout);

  await ctx.report;

  // Stdout and the socket are separate channels, so the pipe is read to its end
  // after the kill: anything printed before the report is in it by then.
  stopProcessGroup(group);

  const printed = await output;

  expect(printed).toBe('');
});

test('it prints its key once the delay it is given passes', async () => {
  const ctx = await setupTest();

  const helper = spawn(
    process.execPath,
    [join(import.meta.dir, 'run-stub-key-helper.ts'), ctx.socketPath, '0'],
    { detached: true, stdio: ['ignore', 'pipe', 'ignore'] },
  );

  invariant(helper.pid !== undefined, 'the stub started');

  const group = helper.pid;

  onTestFinished(() => {
    stopProcessGroup(group);
  });

  let output = '';
  const printed = Promise.withResolvers<void>();

  helper.stdout.setEncoding('utf8');

  helper.stdout.on('data', (chunk: string) => {
    output += chunk;

    printed.resolve();
  });

  await printed.promise;

  expect(output).toBe('offline-test-key\n');
});

test('it refuses to start without a socket path', () => {
  const run = spawnSync(process.execPath, [join(import.meta.dir, 'run-stub-key-helper.ts')], {
    encoding: 'utf8',
  });

  expect(run.status).toBe(1);
  expect(run.stderr).toInclude('run-stub-key-helper needs a socket path');
});
