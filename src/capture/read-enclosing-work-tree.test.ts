import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGit } from '../../test-utils/run-git.ts';
import { readEnclosingWorkTree } from './read-enclosing-work-tree.ts';

async function setupTest(): Promise<{ readonly directory: string }> {
  const created = await mkdtemp(join(tmpdir(), 'auto-mode-work-tree-'));

  onTestFinished(() => rm(created, { recursive: true, force: true }));

  return { directory: await realpath(created) };
}

test('it finds no work tree for a path outside every checkout', async () => {
  const ctx = await setupTest();
  const workTree = await readEnclosingWorkTree(join(ctx.directory, 'captures'));

  expect(workTree).toBeNull();
});

test('it finds the checkout that holds a path that does not exist yet', async () => {
  const ctx = await setupTest();

  runGit(ctx.directory, ['init', '-q', '-b', 'main', join(ctx.directory, 'repo')]);

  const workTree = await readEnclosingWorkTree(join(ctx.directory, 'repo', 'a', 'b'));

  expect(workTree).toBe(join(ctx.directory, 'repo'));
});

test('it finds a linked worktree by its .git file', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'linked'));
  await writeFile(join(ctx.directory, 'linked', '.git'), 'gitdir: /elsewhere\n');

  const workTree = await readEnclosingWorkTree(join(ctx.directory, 'linked', 'captures'));

  expect(workTree).toBe(join(ctx.directory, 'linked'));
});

test('it follows a link that points into a checkout', async () => {
  const ctx = await setupTest();

  runGit(ctx.directory, ['init', '-q', '-b', 'main', join(ctx.directory, 'repo')]);

  await symlink(join(ctx.directory, 'repo'), join(ctx.directory, 'link'));

  const workTree = await readEnclosingWorkTree(join(ctx.directory, 'link', 'captures'));

  expect(workTree).toBe(join(ctx.directory, 'repo'));
});

test('it finds no work tree below a path held by a file', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'blocker'), '');

  const workTree = await readEnclosingWorkTree(join(ctx.directory, 'blocker', 'captures'));

  expect(workTree).toBeNull();
});
