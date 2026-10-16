import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveShippedModDir } from './resolve-shipped-mod-dir.ts';

async function setupTest(): Promise<{ readonly root: string }> {
  const root = await mkdtemp(join(tmpdir(), 'auto-mode-mod-dir-'));

  onTestFinished(() => rm(root, { recursive: true, force: true }));

  return { root };
}

test('it finds the mod of the package it ships in', () => {
  expect(resolveShippedModDir()).toBe(join(import.meta.dirname, '..', '..', 'mods', 'auto-mode'));
});

test('it finds the mod beside the shipped policy above a flattened dist directory', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'policy'));
  await writeFile(join(ctx.root, 'policy', 'classifier.md'), '<rules>\n');
  await mkdir(join(ctx.root, 'mods', 'auto-mode', '.claude-plugin'), { recursive: true });
  await writeFile(join(ctx.root, 'mods', 'auto-mode', '.claude-plugin', 'plugin.json'), '{}\n');
  await mkdir(join(ctx.root, 'dist'));

  expect(resolveShippedModDir(join(ctx.root, 'dist'))).toBe(join(ctx.root, 'mods', 'auto-mode'));
});

test('it throws when the package beside the shipped policy holds no mod', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'policy'));
  await writeFile(join(ctx.root, 'policy', 'classifier.md'), '<rules>\n');
  await mkdir(join(ctx.root, 'mods', 'auto-mode'), { recursive: true });
  await mkdir(join(ctx.root, 'dist'));

  expect(() => resolveShippedModDir(join(ctx.root, 'dist'))).toThrowWithMessage(
    Error,
    'auto-mode cannot find its shipped mod',
  );
});
