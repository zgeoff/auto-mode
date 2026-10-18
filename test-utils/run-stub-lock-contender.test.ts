import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { waitFor } from './wait-for.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'auto-mode-stub-lock-contender-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const barrierDir = join(directory, 'barrier');

  await mkdir(barrierDir);

  return {
    stubPath: join(import.meta.dir, 'run-stub-lock-contender.ts'),
    statePath: join(directory, 'state', 'session.json'),
    logPath: join(directory, 'turns.log'),
    barrierDir,
  };
}

test('it adds one to the count and logs its turn under the lock', async () => {
  const ctx = await setupTest();

  const contender = Bun.spawn(
    [process.execPath, ctx.stubPath, ctx.statePath, ctx.logPath, 'a', ctx.barrierDir, '0', '1'],
    { stderr: 'pipe' },
  );

  const exitCode = await contender.exited;
  const state = await readFile(ctx.statePath, 'utf8');
  const log = await readFile(ctx.logPath, 'utf8');
  const barrier = await readdir(ctx.barrierDir);

  expect(exitCode).toBe(0);
  expect(state).toBe('{"count":1}\n');
  expect(log).toBe('enter a\nleave a\n');
  expect(barrier).toStrictEqual([]);
});

test('it waits at the barrier once it finds the lock held until every contender arrives', async () => {
  const ctx = await setupTest();

  const lockedAt = Date.parse('2026-01-01T00:00:00Z');

  await mkdir(dirname(ctx.statePath));
  await writeFile(`${ctx.statePath}.lock`, 'held by another update\n');
  await utimes(`${ctx.statePath}.lock`, new Date(lockedAt), new Date(lockedAt));

  const contender = Bun.spawn(
    [
      process.execPath,
      ctx.stubPath,
      ctx.statePath,
      ctx.logPath,
      'a',
      ctx.barrierDir,
      String(lockedAt + 10_001),
      '2',
    ],
    { stderr: 'pipe' },
  );

  onTestFinished(() => {
    contender.kill();
  });

  const arrived = await waitFor(
    () => readdir(ctx.barrierDir),
    (entries) => entries.length > 0,
  );

  const stateWhileWaiting = await readdir(dirname(ctx.statePath));

  await writeFile(join(ctx.barrierDir, 'b'), '');

  const exitCode = await contender.exited;
  const state = await readFile(ctx.statePath, 'utf8');

  expect(arrived).toStrictEqual(['a']);

  expect(stateWhileWaiting).toIncludeSameMembers([
    'session.json.lock',
    expect.stringMatching(/^session\.json\.lock\.[\da-f-]{36}$/u),
  ]);

  expect(exitCode).toBe(0);
  expect(state).toBe('{"count":1}\n');
});
