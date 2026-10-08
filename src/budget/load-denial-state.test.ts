import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDenialState } from './load-denial-state.ts';

async function setupTest(): Promise<{ readonly dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-denials-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it reads the counts from the session file', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.dir, 'session.json'),
    '{"consecutive":2,"session":5,"lastDenied":{"retryKey":"action-a","rule":"Rule","reason":"Base reason."}}\n',
  );

  const loaded = await loadDenialState(join(ctx.dir, 'session.json'));

  expect(loaded).toStrictEqual({
    consecutive: 2,
    session: 5,
    lastDenied: { retryKey: 'action-a', rule: 'Rule', reason: 'Base reason.' },
  });
});

test('it starts from zero when the session has no file', async () => {
  const ctx = await setupTest();
  const loaded = await loadDenialState(join(ctx.dir, 'session.json'));

  expect(loaded).toStrictEqual({ consecutive: 0, session: 0, lastDenied: null });
});

test('it starts from zero when the file cannot be read', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'session.json'));

  const loaded = await loadDenialState(join(ctx.dir, 'session.json'));

  expect(loaded).toStrictEqual({ consecutive: 0, session: 0, lastDenied: null });
});

test('it starts from zero when the file is not JSON', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'session.json'), '{"consecutive":2,');

  const loaded = await loadDenialState(join(ctx.dir, 'session.json'));

  expect(loaded).toStrictEqual({ consecutive: 0, session: 0, lastDenied: null });
});

test('it starts from zero when a count is negative', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.dir, 'session.json'),
    '{"consecutive":-1,"session":5,"lastDenied":{"retryKey":"action-a","rule":"Rule","reason":"Base reason."}}\n',
  );

  const loaded = await loadDenialState(join(ctx.dir, 'session.json'));

  expect(loaded).toStrictEqual({ consecutive: 0, session: 0, lastDenied: null });
});
