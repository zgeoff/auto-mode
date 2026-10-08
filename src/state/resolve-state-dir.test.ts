import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveStateDir } from './resolve-state-dir.ts';

async function setupTest(): Promise<{ readonly dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-state-dir-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it keeps state under the home state directory when XDG_STATE_HOME is unset', async () => {
  const ctx = await setupTest();

  expect(resolveStateDir({ env: {}, home: ctx.dir })).toBe(
    join(ctx.dir, '.local', 'state', 'auto-mode'),
  );
});

test('it keeps state under the home state directory when XDG_STATE_HOME is empty', async () => {
  const ctx = await setupTest();

  expect(resolveStateDir({ env: { XDG_STATE_HOME: '' }, home: ctx.dir })).toBe(
    join(ctx.dir, '.local', 'state', 'auto-mode'),
  );
});

test('it keeps state under XDG_STATE_HOME when it is set', async () => {
  const ctx = await setupTest();

  expect(resolveStateDir({ env: { XDG_STATE_HOME: join(ctx.dir, 'xdg') }, home: ctx.dir })).toBe(
    join(ctx.dir, 'xdg', 'auto-mode'),
  );
});
