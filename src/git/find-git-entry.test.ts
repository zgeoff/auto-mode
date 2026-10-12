import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findGitEntry } from './find-git-entry.ts';

async function setupTest() {
  const created = await mkdtemp(join(tmpdir(), 'auto-mode-find-git-entry-'));

  onTestFinished(() => rm(created, { recursive: true, force: true }));

  return { dir: await realpath(created) };
}

test('it finds the nearest .git directory above the start', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'app', '.git'), { recursive: true });
  await mkdir(join(ctx.dir, 'app', 'src'));

  const entry = await findGitEntry(join(ctx.dir, 'app', 'src'), ctx.dir);

  expect(entry).toStrictEqual({
    directory: join(ctx.dir, 'app'),
    gitPath: join(ctx.dir, 'app', '.git'),
  });
});

test('it finds a .git file the same as a directory', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, '.git'), 'gitdir: elsewhere\n');

  const entry = await findGitEntry(ctx.dir, ctx.dir);

  expect(entry).toStrictEqual({ directory: ctx.dir, gitPath: join(ctx.dir, '.git') });
});

test('it finds a .git link whose target is missing', async () => {
  const ctx = await setupTest();

  await symlink(join(ctx.dir, 'missing'), join(ctx.dir, '.git'));

  const entry = await findGitEntry(ctx.dir, ctx.dir);

  expect(entry).toStrictEqual({ directory: ctx.dir, gitPath: join(ctx.dir, '.git') });
});

test('it finds no entry above the stop directory', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, '.git'));
  await mkdir(join(ctx.dir, 'notes'));

  expect(findGitEntry(join(ctx.dir, 'notes'), join(ctx.dir, 'notes'))).resolves.toBeNull();
});

test('it finds no entry when the start sits below a file', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'blocker'), '');

  expect(findGitEntry(join(ctx.dir, 'blocker', 'inner'), ctx.dir)).resolves.toBeNull();
});
