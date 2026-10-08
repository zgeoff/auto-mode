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

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-stub-key-helper-'));

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
    process.kill(-group, 'SIGKILL');
  });

  const body = await ctx.report;

  const report = z.object({ helper: z.number(), child: z.number() }).parse(JSON.parse(body));

  const child = await loadProcessState(report.child);

  expect(report).toStrictEqual({ helper: group, child: expect.toBeNumber() });

  expect(child).toStrictEqual({
    state: expect.toBeOneOf(['R', 'S']),
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
    process.kill(-group, 'SIGKILL');
  });

  let output = '';

  helper.stdout.setEncoding('utf8');

  helper.stdout.on('data', (chunk: string) => {
    output += chunk;
  });

  await ctx.report;

  expect(output).toBe('');
});

test('it refuses to start without a socket path', () => {
  const run = spawnSync(process.execPath, [join(import.meta.dir, 'run-stub-key-helper.ts')], {
    encoding: 'utf8',
  });

  expect(run.status).not.toBe(0);
  expect(run.stderr).toInclude('run-stub-key-helper needs a socket path');
});
