import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRepositoryContext } from './load-repository-context.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'repository-context-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const repo = join(dir, 'repo');
  const gitDir = join(repo, '.git');

  return { dir, repo, gitDir };
}

test("it reads a feature branch from a linked worktree's metadata", async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.gitDir, 'refs', 'remotes', 'origin'), { recursive: true });

  await writeFile(
    join(ctx.gitDir, 'refs', 'remotes', 'origin', 'HEAD'),
    'ref: refs/remotes/origin/main\n',
  );

  const worktree = join(ctx.repo, '.worktrees', 'fix-detail');
  const worktreeGit = join(ctx.gitDir, 'worktrees', 'fix-detail');

  await mkdir(join(worktree, 'src'), { recursive: true });
  await mkdir(worktreeGit, { recursive: true });
  await writeFile(join(worktree, '.git'), `gitdir: ${worktreeGit}\n`);
  await writeFile(join(worktreeGit, 'HEAD'), 'ref: refs/heads/fix-detail\n');
  await writeFile(join(worktreeGit, 'commondir'), '../..\n');

  const context = await loadRepositoryContext(join(worktree, 'src'), {});

  expect(context).toStrictEqual({
    cwd: join(worktree, 'src'),
    branch: 'fix-detail',
    defaultBranch: 'main',
    remotes: [],
  });
});

test('it reports main even when the worktree directory has a feature name', async () => {
  const ctx = await setupTest();

  const worktree = join(ctx.repo, '.worktrees', 'fix-detail');

  await mkdir(join(worktree, '.git'), { recursive: true });
  await writeFile(join(worktree, '.git', 'HEAD'), 'ref: refs/heads/main\n');

  const context = await loadRepositoryContext(worktree, {});

  expect(context).toStrictEqual({
    cwd: worktree,
    branch: 'main',
    defaultBranch: null,
    remotes: [],
  });
});

test('it keeps detached and unknown default branches unknown', async () => {
  const ctx = await setupTest();

  await mkdir(ctx.gitDir, { recursive: true });
  await writeFile(join(ctx.gitDir, 'HEAD'), `${'a'.repeat(40)}\n`);

  const context = await loadRepositoryContext(ctx.repo, {});

  expect(context).toStrictEqual({
    cwd: ctx.repo,
    branch: null,
    defaultBranch: null,
    remotes: [],
  });
});

test('it reads a custom default branch without assuming main', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.gitDir, 'refs', 'remotes', 'origin'), { recursive: true });
  await writeFile(join(ctx.gitDir, 'HEAD'), 'ref: refs/heads/stable\n');

  await writeFile(
    join(ctx.gitDir, 'refs', 'remotes', 'origin', 'HEAD'),
    'ref: refs/remotes/origin/stable\n',
  );

  const context = await loadRepositoryContext(ctx.repo, {});

  expect(context).toStrictEqual({
    cwd: ctx.repo,
    branch: 'stable',
    defaultBranch: 'stable',
    remotes: [],
  });
});

test('it returns no evidence when no directory up to the root holds Git metadata', async () => {
  const ctx = await setupTest();
  const context = await loadRepositoryContext(ctx.dir, {});

  expect(context).toBeNull();
});

test('it returns no evidence when the checkout has no readable HEAD', async () => {
  const ctx = await setupTest();

  await mkdir(ctx.gitDir, { recursive: true });

  const context = await loadRepositoryContext(ctx.repo, {});

  expect(context).toBeNull();
});

test('it never borrows parent branch evidence when a linked worktree has broken metadata', async () => {
  const ctx = await setupTest();

  await mkdir(ctx.gitDir, { recursive: true });
  await writeFile(join(ctx.gitDir, 'HEAD'), 'ref: refs/heads/parent-feature\n');

  const worktree = join(ctx.repo, '.worktrees', 'broken');

  await mkdir(worktree, { recursive: true });
  await writeFile(join(worktree, '.git'), `gitdir: ${join(ctx.dir, 'missing-worktree-gitdir')}\n`);

  const context = await loadRepositoryContext(worktree, {});

  expect(context).toBeNull();
});

test.each(['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR'] as const)(
  'it omits branch evidence when inherited %s targets another repository',
  async (name) => {
    const ctx = await setupTest();

    await mkdir(ctx.gitDir, { recursive: true });
    await writeFile(join(ctx.gitDir, 'HEAD'), 'ref: refs/heads/feature\n');

    const context = await loadRepositoryContext(ctx.repo, { [name]: join(ctx.dir, 'another') });

    expect(context).toBeNull();
  },
);

test('it reads the checkout remotes without the user info a URL can carry', async () => {
  const ctx = await setupTest();

  const token = ['ghp', '_', 'Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2Rl'].join('');

  await mkdir(ctx.gitDir, { recursive: true });

  await writeFile(
    join(ctx.gitDir, 'config'),
    [
      '[remote "origin"]',
      '\turl = git@github.com:dev/app.git',
      '[remote "mirror"]',
      `\turl = https://dev:${token}@git.example.com/dev/app.git`,
      '[remote "quoted"]',
      `\turl = "https://dev:${token}@git.example.com/dev/app.git" # mirror`,
      '[remote "odd"]',
      `\turl = dev:${token}@git.example.com:dev/app.git`,
      '[remote "token"]',
      `\turl = ${token}@git.example.com:dev/app.git`,
      '',
    ].join('\n'),
  );

  await writeFile(join(ctx.gitDir, 'HEAD'), 'ref: refs/heads/main\n');

  const context = await loadRepositoryContext(ctx.repo, {});

  expect(context).toStrictEqual({
    cwd: ctx.repo,
    branch: 'main',
    defaultBranch: null,
    remotes: [
      { name: 'origin', url: 'github.com:dev/app.git' },
      { name: 'mirror', url: 'https://git.example.com/dev/app.git' },
      { name: 'quoted', url: 'https://git.example.com/dev/app.git' },
      { name: 'odd', url: 'git.example.com:dev/app.git' },
      { name: 'token', url: 'git.example.com:dev/app.git' },
    ],
  });
});
