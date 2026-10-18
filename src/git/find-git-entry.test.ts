import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findGitEntry } from './find-git-entry.ts';

async function setupTest() {
  const created = await mkdtemp(join(tmpdir(), 'auto-mode-find-git-entry-'));

  onTestFinished(() => rm(created, { recursive: true, force: true }));

  return { directory: await realpath(created) };
}

test('it finds the nearest .git directory above the start', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'app', '.git'), { recursive: true });
  await mkdir(join(ctx.directory, 'app', 'src'));

  const entry = await findGitEntry(join(ctx.directory, 'app', 'src'), ctx.directory);

  expect(entry).toStrictEqual({
    directory: join(ctx.directory, 'app'),
    gitPath: join(ctx.directory, 'app', '.git'),
  });
});

test('it finds a .git file the same as a directory', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, '.git'), 'gitdir: elsewhere\n');

  const entry = await findGitEntry(ctx.directory, ctx.directory);

  expect(entry).toStrictEqual({ directory: ctx.directory, gitPath: join(ctx.directory, '.git') });
});

test('it finds a .git link whose target is missing', async () => {
  const ctx = await setupTest();

  await symlink(join(ctx.directory, 'missing'), join(ctx.directory, '.git'));

  const entry = await findGitEntry(ctx.directory, ctx.directory);

  expect(entry).toStrictEqual({ directory: ctx.directory, gitPath: join(ctx.directory, '.git') });
});

test('it finds no entry above the stop directory', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, '.git'));
  await mkdir(join(ctx.directory, 'notes'));

  expect(
    findGitEntry(join(ctx.directory, 'notes'), join(ctx.directory, 'notes')),
  ).resolves.toBeNull();
});

test('it finds no entry when the start sits below a file', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'blocker'), '');

  expect(findGitEntry(join(ctx.directory, 'blocker', 'inner'), ctx.directory)).resolves.toBeNull();
});
