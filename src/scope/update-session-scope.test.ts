import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGit } from '../../test-utils/run-git.ts';
import { loadTaskScope } from './load-task-scope.ts';
import { updateSessionScope } from './update-session-scope.ts';

async function setupTest() {
  const created = await mkdtemp(join(tmpdir(), 'auto-mode-record-'));
  const root = await realpath(created);

  onTestFinished(() => rm(root, { recursive: true, force: true }));

  const repo = join(root, 'app');
  const other = join(root, 'other');

  for (const [directory, url] of [
    [repo, 'git@github.com:dev/app.git'],
    [other, 'git@github.com:dev/other.git'],
  ] as const) {
    runGit(root, ['init', '-q', '-b', 'main', directory]);
    runGit(root, ['-C', directory, 'commit', '-q', '--allow-empty', '-m', 'init']);
    runGit(root, ['-C', directory, 'remote', 'add', 'origin', url]);
  }

  // The forge knows no PR unless a test says otherwise; `gh pr view` is the
  // command layer this stands in for.
  const options = {
    now: Date.now(),
    stateDir: join(root, 'state'),
    home: root,
    env: {},
    readPullRequest: () => Promise.resolve(null),
  };

  return { root, repo, other, options };
}

test('it records a worktree and its branch made during the call, and a later load reads them', async () => {
  const ctx = await setupTest();

  const startedAt = Date.now();

  runGit(ctx.root, ['-C', ctx.repo, 'worktree', 'add', '.worktrees/x', '-b', 'feat/x']);

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
    { env: {}, home: ctx.root },
  );

  expect([scope.worktrees, scope.branches]).toStrictEqual([
    [ctx.repo, join(ctx.repo, '.worktrees', 'x')],
    ['feat/x'],
  ]);
});

test('it owns a recorded branch only in the repository the session made it in', async () => {
  const ctx = await setupTest();

  const startedAt = Date.now();

  runGit(ctx.root, ['-C', ctx.repo, 'branch', 'shared']);
  runGit(ctx.root, ['-C', ctx.other, 'branch', 'shared']);

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
        { env: {}, home: ctx.root },
      ),
    ),
  );

  expect([here?.branches, there?.branches]).toStrictEqual([['shared'], []]);
});

test('it records no worktree or branch that existed before the call started', async () => {
  const ctx = await setupTest();

  runGit(ctx.root, ['-C', ctx.repo, 'worktree', 'add', '.worktrees/x', '-b', 'feat/x']);
  runGit(ctx.root, ['-C', ctx.repo, 'branch', 'feat/y']);

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

  runGit(ctx.root, ['-C', ctx.repo, 'worktree', 'add', '.worktrees/x', '-b', 'feat/x']);

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

  runGit(ctx.root, ['-C', ctx.repo, 'branch', 'feat/y']);

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
    runGit(ctx.root, ['-C', ctx.repo, 'branch', name]);
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
    { env: {}, home: ctx.root },
  );

  expect(scope.branches).toIncludeSameMembers(names);
});

test('it records nothing for a call that claims to have started long ago', async () => {
  const ctx = await setupTest();

  runGit(ctx.root, ['-C', ctx.repo, 'branch', 'feat/old']);

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
