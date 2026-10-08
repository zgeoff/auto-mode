import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProcessState } from './load-process-state.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-proc-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it reads the state and start time of a running process', async () => {
  const state = await loadProcessState(process.pid);

  expect(state).toStrictEqual({
    state: expect.toBeOneOf(['R', 'S']),
    startTime: expect.toBeString(),
  });
});

// The kernel hands out process IDs below pid_max, so that number never names a
// process.
test('it reads nothing for a process ID no process holds', async () => {
  const pidMax = await readFile('/proc/sys/kernel/pid_max', 'utf8');
  const state = await loadProcessState(Number(pidMax));

  expect(state).toBeNull();
});

test('it throws on a stat line without a start time', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, '42'));
  await writeFile(join(ctx.dir, '42', 'stat'), '42 (sleep) S 1\n');

  expect(loadProcessState(42, ctx.dir)).rejects.toThrowWithMessage(
    Error,
    'unreadable process stat for 42',
  );
});

test('it rethrows a read failure other than a missing process', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, '42', 'stat'), { recursive: true });

  expect(loadProcessState(42, ctx.dir)).rejects.toMatchObject({ code: 'EISDIR' });
});
