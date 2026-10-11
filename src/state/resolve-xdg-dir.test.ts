import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMockHostEnvironment } from '../../test-utils/factories/build-mock-host-environment.ts';
import { resolveXDGDir } from './resolve-xdg-dir.ts';

async function setupTest(): Promise<{ readonly dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-xdg-dir-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it keeps state under the home state directory when XDG_STATE_HOME is unset', async () => {
  const ctx = await setupTest();

  const host = buildMockHostEnvironment({ env: {}, home: ctx.dir });

  expect(resolveXDGDir(host, 'state')).toBe(join(ctx.dir, '.local', 'state', 'auto-mode'));
});

test('it keeps state under the home state directory when XDG_STATE_HOME is empty', async () => {
  const ctx = await setupTest();

  expect(
    resolveXDGDir(
      buildMockHostEnvironment({ env: { XDG_STATE_HOME: '' }, home: ctx.dir }),
      'state',
    ),
  ).toBe(join(ctx.dir, '.local', 'state', 'auto-mode'));
});

test('it keeps state under XDG_STATE_HOME when it is set', async () => {
  const ctx = await setupTest();

  const host = buildMockHostEnvironment({
    env: { XDG_STATE_HOME: join(ctx.dir, 'xdg') },
    home: ctx.dir,
  });

  expect(resolveXDGDir(host, 'state')).toBe(join(ctx.dir, 'xdg', 'auto-mode'));
});

test('it keeps config under the home config directory when XDG_CONFIG_HOME is empty', async () => {
  const ctx = await setupTest();

  const host = buildMockHostEnvironment({ env: { XDG_CONFIG_HOME: '' }, home: ctx.dir });

  expect(resolveXDGDir(host, 'config')).toBe(join(ctx.dir, '.config', 'auto-mode'));
});

test('it keeps config under XDG_CONFIG_HOME and never under XDG_STATE_HOME', async () => {
  const ctx = await setupTest();

  const host = buildMockHostEnvironment({
    env: { XDG_CONFIG_HOME: join(ctx.dir, 'config'), XDG_STATE_HOME: join(ctx.dir, 'state') },
    home: ctx.dir,
  });

  expect(resolveXDGDir(host, 'config')).toBe(join(ctx.dir, 'config', 'auto-mode'));
});
