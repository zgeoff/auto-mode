import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGit } from '../../test-utils/run-git.ts';
import { findEnclosingWorkTree } from './find-enclosing-work-tree.ts';

async function setupTest(): Promise<{ readonly dir: string }> {
  const created = await mkdtemp(join(tmpdir(), 'auto-mode-work-tree-'));

  onTestFinished(() => rm(created, { recursive: true, force: true }));

  return { dir: await realpath(created) };
}

test('it finds no work tree for a path outside every checkout', async () => {
  const ctx = await setupTest();
  const workTree = await findEnclosingWorkTree(join(ctx.dir, 'captures'));

  expect(workTree).toBeNull();
});

test('it finds the checkout that holds a path that does not exist yet', async () => {
  const ctx = await setupTest();

  runGit(ctx.dir, ['init', '-q', '-b', 'main', join(ctx.dir, 'repo')]);

  const workTree = await findEnclosingWorkTree(join(ctx.dir, 'repo', 'a', 'b'));

  expect(workTree).toBe(join(ctx.dir, 'repo'));
});

test('it finds a linked worktree by its .git file', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'linked'));
  await writeFile(join(ctx.dir, 'linked', '.git'), 'gitdir: /elsewhere\n');

  const workTree = await findEnclosingWorkTree(join(ctx.dir, 'linked', 'captures'));

  expect(workTree).toBe(join(ctx.dir, 'linked'));
});

test('it follows a link that points into a checkout', async () => {
  const ctx = await setupTest();

  runGit(ctx.dir, ['init', '-q', '-b', 'main', join(ctx.dir, 'repo')]);

  await symlink(join(ctx.dir, 'repo'), join(ctx.dir, 'link'));

  const workTree = await findEnclosingWorkTree(join(ctx.dir, 'link', 'captures'));

  expect(workTree).toBe(join(ctx.dir, 'repo'));
});

test('it finds no work tree below a path held by a file', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'blocker'), '');

  const workTree = await findEnclosingWorkTree(join(ctx.dir, 'blocker', 'captures'));

  expect(workTree).toBeNull();
});
