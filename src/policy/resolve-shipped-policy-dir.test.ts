import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveShippedPolicyDir } from './resolve-shipped-policy-dir.ts';

async function setupTest(): Promise<{ readonly root: string }> {
  const root = await mkdtemp(join(tmpdir(), 'auto-mode-policy-dir-'));

  onTestFinished(() => rm(root, { recursive: true, force: true }));

  return { root };
}

test('it finds the policy directory of the package it ships in', () => {
  expect(resolveShippedPolicyDir()).toBe(join(import.meta.dirname, '..', '..', 'policy'));
});

test('it walks up from a nested directory to the nearest shipped policy', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'policy'));
  await writeFile(join(ctx.root, 'policy', 'classifier.md'), '<rules>\n');
  await mkdir(join(ctx.root, 'dist', 'chunks'), { recursive: true });

  expect(resolveShippedPolicyDir(join(ctx.root, 'dist', 'chunks'))).toBe(join(ctx.root, 'policy'));
});

test('it passes over a policy directory that holds no classifier framework', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'policy'));
  await writeFile(join(ctx.root, 'policy', 'classifier.md'), '<rules>\n');
  await mkdir(join(ctx.root, 'dist', 'policy'), { recursive: true });
  await writeFile(join(ctx.root, 'dist', 'policy', 'rules.md'), 'RULES\n');

  expect(resolveShippedPolicyDir(join(ctx.root, 'dist'))).toBe(join(ctx.root, 'policy'));
});

test('it throws when no directory up to the stop directory holds a shipped policy', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'dist', 'chunks'), { recursive: true });

  expect(() =>
    resolveShippedPolicyDir(join(ctx.root, 'dist', 'chunks'), ctx.root),
  ).toThrowWithMessage(Error, /cannot find its shipped policy\/ directory/u);
});

test('it stops at the stop directory before a policy above it', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'policy'));
  await writeFile(join(ctx.root, 'policy', 'classifier.md'), '<rules>\n');
  await mkdir(join(ctx.root, 'pkg', 'dist'), { recursive: true });

  expect(() =>
    resolveShippedPolicyDir(join(ctx.root, 'pkg', 'dist'), join(ctx.root, 'pkg')),
  ).toThrowWithMessage(Error, /cannot find its shipped policy\/ directory/u);
});
