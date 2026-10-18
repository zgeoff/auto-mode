import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMockHostEnvironment } from '../../test-utils/factories/build-mock-host-environment.ts';
import { resolveXDGDir } from './resolve-xdg-dir.ts';

async function setupTest(): Promise<{ readonly directory: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'auto-mode-xdg-dir-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it keeps state under the home state directory when XDG_STATE_HOME is unset', async () => {
  const ctx = await setupTest();

  const host = buildMockHostEnvironment({ env: {}, home: ctx.directory });

  expect(resolveXDGDir(host, 'state')).toBe(join(ctx.directory, '.local', 'state', 'auto-mode'));
});

test('it keeps state under the home state directory when XDG_STATE_HOME is empty', async () => {
  const ctx = await setupTest();

  expect(
    resolveXDGDir(
      buildMockHostEnvironment({ env: { XDG_STATE_HOME: '' }, home: ctx.directory }),
      'state',
    ),
  ).toBe(join(ctx.directory, '.local', 'state', 'auto-mode'));
});

test('it keeps state under XDG_STATE_HOME when it is set', async () => {
  const ctx = await setupTest();

  const host = buildMockHostEnvironment({
    env: { XDG_STATE_HOME: join(ctx.directory, 'xdg') },
    home: ctx.directory,
  });

  expect(resolveXDGDir(host, 'state')).toBe(join(ctx.directory, 'xdg', 'auto-mode'));
});

test('it keeps config under the home config directory when XDG_CONFIG_HOME is empty', async () => {
  const ctx = await setupTest();

  const host = buildMockHostEnvironment({ env: { XDG_CONFIG_HOME: '' }, home: ctx.directory });

  expect(resolveXDGDir(host, 'config')).toBe(join(ctx.directory, '.config', 'auto-mode'));
});

test('it keeps config under XDG_CONFIG_HOME and never under XDG_STATE_HOME', async () => {
  const ctx = await setupTest();

  const host = buildMockHostEnvironment({
    env: {
      XDG_CONFIG_HOME: join(ctx.directory, 'config'),
      XDG_STATE_HOME: join(ctx.directory, 'state'),
    },
    home: ctx.directory,
  });

  expect(resolveXDGDir(host, 'config')).toBe(join(ctx.directory, 'config', 'auto-mode'));
});
