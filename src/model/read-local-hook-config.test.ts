import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readLocalHookConfig } from './read-local-hook-config.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'auto-mode-local-hook-config-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it reads the local lefthook config an Edit changes, relative to the cwd', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'lefthook-local.yml'), 'pre-push:\n  skip: false\n');

  const content = await readLocalHookConfig({
    cwd: ctx.directory,
    toolName: 'Edit',
    toolInput: { file_path: 'lefthook-local.yml', old_string: 'false', new_string: 'true' },
  });

  expect(content).toBe('pre-push:\n  skip: false\n');
});

test('it reads nothing for an Edit of a local lefthook config that does not exist', async () => {
  const ctx = await setupTest();

  const content = await readLocalHookConfig({
    cwd: ctx.directory,
    toolName: 'Edit',
    toolInput: { file_path: join(ctx.directory, 'lefthook-local.yml') },
  });

  expect(content).toBeNull();
});

test('it reads nothing for an Edit of another file', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'lefthook.yml'), 'pre-push:\n  skip: false\n');

  const content = await readLocalHookConfig({
    cwd: ctx.directory,
    toolName: 'Edit',
    toolInput: { file_path: join(ctx.directory, 'lefthook.yml') },
  });

  expect(content).toBeNull();
});

test('it reads nothing for a Write, which replaces the whole file', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'lefthook-local.yml'), 'pre-push:\n  skip: false\n');

  const content = await readLocalHookConfig({
    cwd: ctx.directory,
    toolName: 'Write',
    toolInput: { file_path: join(ctx.directory, 'lefthook-local.yml'), content: '' },
  });

  expect(content).toBeNull();
});
