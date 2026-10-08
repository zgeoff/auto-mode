import { expect, onTestFinished, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { text } from 'node:stream/consumers';
import invariant from 'tiny-invariant';
import * as z from 'zod';
import { readProcessState } from './read-process-state.ts';

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

  const child = await readProcessState(report.child);

  expect(report).toStrictEqual({ helper: group, child: expect.toBeNumber() });

  expect(child).toStrictEqual({
    state: expect.toBeOneOf(['R', 'S']),
    startTime: expect.toBeString(),
  });
});
