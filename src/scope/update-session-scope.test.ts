import { expect, onTestFinished, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTaskScope } from './load-task-scope.ts';
import { updateSessionScope } from './update-session-scope.ts';

async function setupTest() {
  const gitEnv = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE'].map(
    (name) => [name, process.env[name]] as const,
  );

  for (const [name] of gitEnv) {
    delete process.env[name];
  }

  const created = await mkdtemp(join(tmpdir(), 'auto-mode-record-'));
  const root = await realpath(created);

  onTestFinished(async () => {
    for (const [name, value] of gitEnv) {
      if (value !== undefined) {
        process.env[name] = value;
      }
    }

    await rm(root, { recursive: true, force: true });
  });

  const repo = join(root, 'app');
  const other = join(root, 'other');
  const gitProcessEnv = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' };

  const runGit = (directory: string, ...args: readonly string[]): string =>
    execFileSync(
      'git',
      ['-C', directory, '-c', 'user.name=dev', '-c', 'user.email=dev@example.com', ...args],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: gitProcessEnv,
      },
    );

  for (const [directory, url] of [
    [repo, 'git@github.com:dev/app.git'],
    [other, 'git@github.com:dev/other.git'],
  ] as const) {
    execFileSync('git', ['init', '-q', '-b', 'main', directory]);
    runGit(directory, '-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'init');
    runGit(directory, 'remote', 'add', 'origin', url);
  }

  // The forge knows no PR unless a test says otherwise; `gh pr view` is the
  // command layer this stands in for.
  const options = {
    now: Date.now(),
    stateDir: join(root, 'state'),
    home: root,
    readPullRequest: () => Promise.resolve(null),
  };

  return { repo, other, runGit, options };
}

test('it records a worktree and its branch made during the call, and a later load reads them', async () => {
  const ctx = await setupTest();

  const startedAt = Date.now();

  ctx.runGit(ctx.repo, 'worktree', 'add', '.worktrees/x', '-b', 'feat/x');

  await updateSessionScope(
    {
      sessionID: 'session-1',
      cwd: ctx.repo,
      startedAt,
      command: 'git worktree add .worktrees/x -b feat/x',
      resultText: '',
    },
    ctx.options,
  );

  const scope = await loadTaskScope(
    { sessionID: 'session-1', cwd: ctx.repo, stateDir: ctx.options.stateDir },
    { cwd: { kind: 'cwd' }, session: { kind: 'session' } },
  );

  expect([scope.worktrees, scope.branches]).toStrictEqual([
    [ctx.repo, join(ctx.repo, '.worktrees', 'x')],
    ['feat/x'],
  ]);
});

test('it owns a recorded branch only in the repository the session made it in', async () => {
  const ctx = await setupTest();

  const startedAt = Date.now();

  ctx.runGit(ctx.repo, 'branch', 'shared');
  ctx.runGit(ctx.other, 'branch', 'shared');

  await updateSessionScope(
    {
      sessionID: 'session-1',
      cwd: ctx.repo,
      startedAt,
      command: 'git branch shared',
      resultText: '',
    },
    ctx.options,
  );

  const [here, there] = await Promise.all(
    [ctx.repo, ctx.other].map((cwd) =>
      loadTaskScope(
        { sessionID: 'session-1', cwd, stateDir: ctx.options.stateDir },
        { cwd: { kind: 'cwd' }, session: { kind: 'session' } },
      ),
    ),
  );

  expect([here?.branches, there?.branches]).toStrictEqual([['shared'], []]);
});

test('it records no worktree or branch that existed before the call started', async () => {
  const ctx = await setupTest();

  ctx.runGit(ctx.repo, 'worktree', 'add', '.worktrees/x', '-b', 'feat/x');
  ctx.runGit(ctx.repo, 'branch', 'feat/y');

  const scope = await updateSessionScope(
    {
      sessionID: 'session-1',
      cwd: ctx.repo,
      startedAt: Date.now() + 5000,
      command: 'git worktree add .worktrees/x -b feat/x; git checkout -b feat/y',
      resultText: '',
    },
    ctx.options,
  );

  expect(scope).toStrictEqual({ worktrees: [], branches: [], pullRequests: [] });
});

test('it records nothing when the command fails on a worktree made just before the call', async () => {
  const ctx = await setupTest();

  ctx.runGit(ctx.repo, 'worktree', 'add', '.worktrees/x', '-b', 'feat/x');

  const startedAt = Date.now() + 100;
  const command = 'git worktree add .worktrees/x -b feat/x';

  const scope = await updateSessionScope(
    {
      sessionID: 'session-2',
      cwd: ctx.repo,
      startedAt,
      command,
      resultText: "fatal: a branch named 'feat/x' already exists",
    },
    ctx.options,
  );

  expect(scope).toStrictEqual({ worktrees: [], branches: [], pullRequests: [] });
});

test('it records a branch reset by checkout -B as nothing, since it already existed', async () => {
  const ctx = await setupTest();

  ctx.runGit(ctx.repo, 'branch', 'feat/y');

  const scope = await updateSessionScope(
    {
      sessionID: 'session-1',
      cwd: ctx.repo,
      startedAt: Date.now() + 5000,
      command: 'git checkout -B feat/y',
      resultText: '',
    },
    ctx.options,
  );

  expect(scope.branches).toStrictEqual([]);
});

test('it records a PR the forge dates from the call, with the head branch it reports', async () => {
  const ctx = await setupTest();

  const startedAt = Date.now();

  const scope = await updateSessionScope(
    {
      sessionID: 'session-1',
      cwd: ctx.repo,
      startedAt,
      command: 'gh pr create --fill',
      resultText: 'https://github.com/dev/app/pull/12\n',
    },
    {
      ...ctx.options,
      readPullRequest: () => Promise.resolve({ head: 'feat/x', createdAt: startedAt + 900 }),
    },
  );

  expect(scope.pullRequests).toStrictEqual([
    { number: 12, head: 'feat/x', repository: 'github.com/dev/app' },
  ]);
});

test('it records no PR that already existed when gh pr create printed its address', async () => {
  const ctx = await setupTest();

  const startedAt = Date.now();

  const scope = await updateSessionScope(
    {
      sessionID: 'session-1',
      cwd: ctx.repo,
      startedAt,
      command: 'gh pr create --fill',
      resultText:
        'a pull request for branch "feat/x" into branch "main" already exists:\nhttps://github.com/dev/app/pull/12\n',
    },
    {
      ...ctx.options,
      readPullRequest: () => Promise.resolve({ head: 'feat/x', createdAt: startedAt - 3_600_000 }),
    },
  );

  expect(scope.pullRequests).toStrictEqual([]);
});

test('it records no PR printed for another repository', async () => {
  const ctx = await setupTest();

  const startedAt = Date.now();

  const scope = await updateSessionScope(
    {
      sessionID: 'session-1',
      cwd: ctx.repo,
      startedAt,
      command: 'gh pr create --fill',
      resultText: 'https://github.com/someone/app/pull/12\n',
    },
    {
      ...ctx.options,
      readPullRequest: () => Promise.resolve({ head: 'feat/x', createdAt: startedAt }),
    },
  );

  expect(scope.pullRequests).toStrictEqual([]);
});

test('it records no PR the forge does not know', async () => {
  const ctx = await setupTest();

  const scope = await updateSessionScope(
    {
      sessionID: 'session-1',
      cwd: ctx.repo,
      startedAt: Date.now(),
      command: 'gh pr create --fill',
      resultText: 'https://github.com/dev/app/pull/99\n',
    },
    ctx.options,
  );

  expect(scope.pullRequests).toStrictEqual([]);
});

test('it keeps every branch when calls of one session record at the same time', async () => {
  const ctx = await setupTest();

  const names = Array.from({ length: 10 }, (_, index) => `feat/${String(index)}`);
  const startedAt = Date.now();

  for (const name of names) {
    ctx.runGit(ctx.repo, 'branch', name);
  }

  await Promise.all(
    names.map((name) =>
      updateSessionScope(
        {
          sessionID: 'session-1',
          cwd: ctx.repo,
          startedAt,
          command: `git branch ${name}`,
          resultText: '',
        },
        ctx.options,
      ),
    ),
  );

  const scope = await loadTaskScope(
    { sessionID: 'session-1', cwd: ctx.repo, stateDir: ctx.options.stateDir },
    { session: { kind: 'session' } },
  );

  expect(scope.branches).toIncludeSameMembers(names);
});

test('it records nothing for a call that claims to have started long ago', async () => {
  const ctx = await setupTest();

  ctx.runGit(ctx.repo, 'branch', 'feat/old');

  const scope = await updateSessionScope(
    {
      sessionID: 'session-1',
      cwd: ctx.repo,
      startedAt: 1,
      command: 'git branch feat/old',
      resultText: '',
    },
    ctx.options,
  );

  expect(scope).toStrictEqual({ worktrees: [], branches: [], pullRequests: [] });
});

test('it records every PR one call created', async () => {
  const ctx = await setupTest();

  const startedAt = Date.now();

  const heads = new Map([
    [3, 'feat/a'],
    [4, 'feat/b'],
  ]);

  const scope = await updateSessionScope(
    {
      sessionID: 'session-1',
      cwd: ctx.repo,
      startedAt,
      command: 'gh pr create --head feat/a --fill && gh pr create --head feat/b --fill',
      resultText: 'https://github.com/dev/app/pull/3\nhttps://github.com/dev/app/pull/4\n',
    },
    {
      ...ctx.options,
      readPullRequest: (_repository: string, number: number) => {
        const head = heads.get(number);
        const pull = head === undefined ? null : { head, createdAt: startedAt };

        return Promise.resolve(pull);
      },
    },
  );

  expect(scope.pullRequests).toStrictEqual([
    { repository: 'github.com/dev/app', number: 3, head: 'feat/a' },
    { repository: 'github.com/dev/app', number: 4, head: 'feat/b' },
  ]);
});
