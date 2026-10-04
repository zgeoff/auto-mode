import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRepositoryContext } from './load-repository-context.ts';

async function setupTest() {
  const previousGitEnv = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR'].map(
    (name) => [name, process.env[name]] as const,
  );

  for (const [name] of previousGitEnv) {
    delete process.env[name];
  }

  const dir = await mkdtemp(join(tmpdir(), 'repository-context-'));

  const repo = join(dir, 'repo');
  const gitDir = join(repo, '.git');

  await mkdir(join(gitDir, 'refs', 'remotes', 'origin'), { recursive: true });

  await writeFile(
    join(gitDir, 'refs', 'remotes', 'origin', 'HEAD'),
    'ref: refs/remotes/origin/main\n',
  );

  onTestFinished(async () => {
    for (const [name, value] of previousGitEnv) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }

    await rm(dir, { recursive: true, force: true });
  });

  return { dir, repo, gitDir };
}

test('it reads a feature branch from a linked worktree without running Git or its hooks', async () => {
  const ctx = await setupTest();

  const worktree = join(ctx.repo, '.worktrees', 'fix-detail');
  const worktreeGit = join(ctx.gitDir, 'worktrees', 'fix-detail');

  await mkdir(join(worktree, 'src'), { recursive: true });
  await mkdir(worktreeGit, { recursive: true });
  await writeFile(join(worktree, '.git'), `gitdir: ${worktreeGit}\n`);
  await writeFile(join(worktreeGit, 'HEAD'), 'ref: refs/heads/fix-detail\n');
  await writeFile(join(worktreeGit, 'commondir'), '../..\n');

  const context = await loadRepositoryContext(join(worktree, 'src'));

  expect(context).toStrictEqual({
    cwd: join(worktree, 'src'),
    branch: 'fix-detail',
    defaultBranch: 'main',
  });
});

test('it reports main even when the worktree directory has a feature name', async () => {
  const ctx = await setupTest();

  const worktree = join(ctx.repo, '.worktrees', 'fix-detail');

  await mkdir(join(worktree, '.git'), { recursive: true });
  await writeFile(join(worktree, '.git', 'HEAD'), 'ref: refs/heads/main\n');

  const context = await loadRepositoryContext(worktree);

  expect(context).toStrictEqual({
    cwd: worktree,
    branch: 'main',
    defaultBranch: null,
  });
});

test('it keeps detached and unknown default branches unknown', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.gitDir, 'HEAD'), `${'a'.repeat(40)}\n`);
  await rm(join(ctx.gitDir, 'refs', 'remotes', 'origin', 'HEAD'));

  const context = await loadRepositoryContext(ctx.repo);

  expect(context).toStrictEqual({
    cwd: ctx.repo,
    branch: null,
    defaultBranch: null,
  });
});

test('it reads a custom default branch without assuming main', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.gitDir, 'HEAD'), 'ref: refs/heads/stable\n');

  await writeFile(
    join(ctx.gitDir, 'refs', 'remotes', 'origin', 'HEAD'),
    'ref: refs/remotes/origin/stable\n',
  );

  const context = await loadRepositoryContext(ctx.repo);

  expect(context).toStrictEqual({
    cwd: ctx.repo,
    branch: 'stable',
    defaultBranch: 'stable',
  });
});

test('it returns no evidence when the checkout has no readable Git metadata', async () => {
  const ctx = await setupTest();
  const context = await loadRepositoryContext(ctx.dir);

  expect(context).toBeNull();
});

test('it never borrows parent branch evidence when a linked worktree has broken metadata', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.gitDir, 'HEAD'), 'ref: refs/heads/parent-feature\n');

  const worktree = join(ctx.repo, '.worktrees', 'broken');

  await mkdir(worktree, { recursive: true });
  await writeFile(join(worktree, '.git'), 'gitdir: /missing-worktree-gitdir\n');

  const context = await loadRepositoryContext(worktree);

  expect(context).toBeNull();
});

test.each(['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR'] as const)(
  'it omits branch evidence when inherited %s targets another repository',
  async (name) => {
    const ctx = await setupTest();

    await writeFile(join(ctx.gitDir, 'HEAD'), 'ref: refs/heads/feature\n');

    process.env[name] = '/another/repository';

    const context = await loadRepositoryContext(ctx.repo);

    expect(context).toBeNull();
  },
);
