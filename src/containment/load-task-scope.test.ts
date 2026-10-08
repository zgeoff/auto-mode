import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTaskScope } from './load-task-scope.ts';

async function setupTest(): Promise<{ readonly root: string; readonly worktree: string }> {
  const previousGitEnv = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR'].map(
    (name) => [name, process.env[name]] as const,
  );

  for (const [name] of previousGitEnv) {
    delete process.env[name];
  }

  const root = await mkdtemp(join(tmpdir(), 'auto-mode-scope-'));

  onTestFinished(async () => {
    for (const [name, value] of previousGitEnv) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }

    await rm(root, { recursive: true, force: true });
  });

  const common = join(root, '.git');
  const worktree = join(root, '.worktrees', 'feature');
  const linked = join(common, 'worktrees', 'feature');

  await mkdir(join(common, 'refs', 'remotes', 'origin'), { recursive: true });
  await mkdir(linked, { recursive: true });
  await mkdir(join(worktree, 'src'), { recursive: true });
  await writeFile(join(common, 'HEAD'), 'ref: refs/heads/main\n');

  await writeFile(
    join(common, 'refs', 'remotes', 'origin', 'HEAD'),
    'ref: refs/remotes/origin/main\n',
  );

  await writeFile(
    join(common, 'config'),
    '[core]\n\tbare = false\n[remote "origin"]\n\turl = git@github.com:dev/app.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n[branch "main"]\n\tremote = origin\n',
  );

  await writeFile(join(linked, 'HEAD'), 'ref: refs/heads/feature\n');
  await writeFile(join(linked, 'commondir'), '../..\n');
  await writeFile(join(worktree, '.git'), `gitdir: ${linked}\n`);

  return { root, worktree };
}

test('it owns the linked worktree that holds the cwd, its branch, and the remotes', async () => {
  const ctx = await setupTest();
  const scope = await loadTaskScope(join(ctx.worktree, 'src'));

  expect(scope).toStrictEqual({
    home: homedir(),
    worktrees: [ctx.worktree],
    branches: ['feature'],
    currentBranch: 'feature',
    remotes: [{ name: 'origin', url: 'git@github.com:dev/app.git' }],
    pullRequests: [],
  });
});

test('it owns the main checkout but not its default branch', async () => {
  const ctx = await setupTest();
  const scope = await loadTaskScope(ctx.root);

  expect(scope.worktrees).toStrictEqual([ctx.root]);
  expect(scope.branches).toStrictEqual([]);
  expect(scope.currentBranch).toBe('main');
});

test('it owns only the cwd when git directory overrides hide the checkout', async () => {
  const ctx = await setupTest();

  process.env['GIT_DIR'] = join(ctx.root, '.git');

  const scope = await loadTaskScope(ctx.worktree);

  expect(scope).toStrictEqual({
    home: homedir(),
    worktrees: [ctx.worktree],
    branches: [],
    currentBranch: null,
    remotes: [],
    pullRequests: [],
  });
});
