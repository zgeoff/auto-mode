import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildStubLockClock } from '../../test-utils/build-stub-lock-clock.ts';
import { buildStubPullRequestReader } from '../../test-utils/build-stub-pull-request-reader.ts';
import { buildMockScopeRecordRequest } from '../../test-utils/factories/build-mock-scope-record-request.ts';
import { runGit } from '../../test-utils/run-git.ts';
import { loadSessionScope } from './load-session-scope.ts';
import { loadTaskScope } from './load-task-scope.ts';
import { resolveSessionScopePath } from './resolve-session-scope-path.ts';
import { updateSessionScope } from './update-session-scope.ts';

async function setupTest() {
  const created = await mkdtemp(join(tmpdir(), 'auto-mode-record-'));

  onTestFinished(() => rm(created, { recursive: true, force: true }));

  const root = await realpath(created);

  const repo = join(root, 'app');

  // every recorded worktree and branch needs a checkout with a commit under HEAD
  runGit(root, ['init', '-q', '-b', 'main', repo]);
  runGit(root, ['-C', repo, 'commit', '-q', '--allow-empty', '-m', 'init']);

  return { root, repo };
}

test('it records a worktree and its branch made during the call and writes them to the session scope', async () => {
  const ctx = await setupTest();

  const startedAt = Date.now();

  runGit(ctx.root, ['-C', ctx.repo, 'worktree', 'add', '.worktrees/x', '-b', 'feat/x']);

  const request = buildMockScopeRecordRequest({
    cwd: ctx.repo,
    startedAt,
    command: 'git worktree add .worktrees/x -b feat/x',
  });

  const scope = await updateSessionScope(request, {
    now: Date.now(),
    stateDir: join(ctx.root, 'state'),
    home: ctx.root,
    env: {},
    readPullRequest: buildStubPullRequestReader([]),
  });

  const written = await loadSessionScope(
    resolveSessionScopePath(join(ctx.root, 'state'), request.sessionID),
  );

  expect(scope).toStrictEqual({
    worktrees: [join(ctx.repo, '.worktrees', 'x')],
    branches: [{ name: 'feat/x', commonDir: join(ctx.repo, '.git') }],
    pullRequests: [],
  });

  expect(written).toStrictEqual({
    worktrees: [join(ctx.repo, '.worktrees', 'x')],
    branches: [{ name: 'feat/x', commonDir: join(ctx.repo, '.git') }],
    pullRequests: [],
  });
});

test('it owns a recorded branch only in the repository the session made it in', async () => {
  const ctx = await setupTest();

  const other = join(ctx.root, 'other');

  runGit(ctx.root, ['init', '-q', '-b', 'main', other]);
  runGit(ctx.root, ['-C', other, 'commit', '-q', '--allow-empty', '-m', 'init']);

  const startedAt = Date.now();

  runGit(ctx.root, ['-C', ctx.repo, 'branch', 'shared']);
  runGit(ctx.root, ['-C', other, 'branch', 'shared']);

  const request = buildMockScopeRecordRequest({
    cwd: ctx.repo,
    startedAt,
    command: 'git branch shared',
  });

  const scope = await updateSessionScope(request, {
    now: Date.now(),
    stateDir: join(ctx.root, 'state'),
    home: ctx.root,
    env: {},
    readPullRequest: buildStubPullRequestReader([]),
  });

  const there = await loadTaskScope(
    { sessionID: request.sessionID, cwd: other, stateDir: join(ctx.root, 'state') },
    { session: { kind: 'session' } },
    { env: {}, home: ctx.root },
  );

  expect(scope).toStrictEqual({
    worktrees: [],
    branches: [{ name: 'shared', commonDir: join(ctx.repo, '.git') }],
    pullRequests: [],
  });

  expect(there.branches).toStrictEqual([]);
});

test('it records no worktree or branch that existed before the call started', async () => {
  const ctx = await setupTest();

  runGit(ctx.root, ['-C', ctx.repo, 'worktree', 'add', '.worktrees/x', '-b', 'feat/x']);
  runGit(ctx.root, ['-C', ctx.repo, 'branch', 'feat/y']);

  const scope = await updateSessionScope(
    buildMockScopeRecordRequest({
      cwd: ctx.repo,
      startedAt: Date.now() + 5000,
      command: 'git worktree add .worktrees/x -b feat/x; git checkout -b feat/y',
    }),
    {
      now: Date.now(),
      stateDir: join(ctx.root, 'state'),
      home: ctx.root,
      env: {},
      readPullRequest: buildStubPullRequestReader([]),
    },
  );

  expect(scope).toStrictEqual({ worktrees: [], branches: [], pullRequests: [] });
});

test('it records nothing when the command fails on a worktree made just before the call', async () => {
  const ctx = await setupTest();

  runGit(ctx.root, ['-C', ctx.repo, 'worktree', 'add', '.worktrees/x', '-b', 'feat/x']);

  const link = await stat(join(ctx.repo, '.worktrees', 'x', '.git'));

  const scope = await updateSessionScope(
    buildMockScopeRecordRequest({
      cwd: ctx.repo,
      startedAt: link.mtimeMs + 1000,
      command: 'git worktree add .worktrees/x -b feat/x',
      resultText: "fatal: a branch named 'feat/x' already exists",
    }),
    {
      now: Date.now(),
      stateDir: join(ctx.root, 'state'),
      home: ctx.root,
      env: {},
      readPullRequest: buildStubPullRequestReader([]),
    },
  );

  expect(scope).toStrictEqual({ worktrees: [], branches: [], pullRequests: [] });
});

test('it records a branch reset by checkout -B as nothing, since it already existed', async () => {
  const ctx = await setupTest();

  runGit(ctx.root, ['-C', ctx.repo, 'branch', 'feat/y']);

  const scope = await updateSessionScope(
    buildMockScopeRecordRequest({
      cwd: ctx.repo,
      startedAt: Date.now() + 5000,
      command: 'git checkout -B feat/y',
    }),
    {
      now: Date.now(),
      stateDir: join(ctx.root, 'state'),
      home: ctx.root,
      env: {},
      readPullRequest: buildStubPullRequestReader([]),
    },
  );

  expect(scope).toStrictEqual({ worktrees: [], branches: [], pullRequests: [] });
});

test('it records a PR the forge dates from the call, with the head branch it reports', async () => {
  const ctx = await setupTest();

  runGit(ctx.root, ['-C', ctx.repo, 'remote', 'add', 'origin', 'git@github.com:dev/app.git']);

  const startedAt = Date.now();

  const scope = await updateSessionScope(
    buildMockScopeRecordRequest({
      cwd: ctx.repo,
      startedAt,
      command: 'gh pr create --fill',
      resultText: 'https://github.com/dev/app/pull/12\n',
    }),
    {
      now: Date.now(),
      stateDir: join(ctx.root, 'state'),
      home: ctx.root,
      env: {},
      readPullRequest: buildStubPullRequestReader([
        {
          repository: 'github.com/dev/app',
          number: 12,
          head: 'feat/x',
          createdAt: startedAt + 900,
        },
      ]),
    },
  );

  expect(scope).toStrictEqual({
    worktrees: [],
    branches: [],
    pullRequests: [{ number: 12, head: 'feat/x', repository: 'github.com/dev/app' }],
  });
});

test('it records no PR that already existed when gh pr create printed its address', async () => {
  const ctx = await setupTest();

  runGit(ctx.root, ['-C', ctx.repo, 'remote', 'add', 'origin', 'git@github.com:dev/app.git']);

  const startedAt = Date.now();

  const scope = await updateSessionScope(
    buildMockScopeRecordRequest({
      cwd: ctx.repo,
      startedAt,
      command: 'gh pr create --fill',
      resultText:
        'a pull request for branch "feat/x" into branch "main" already exists:\nhttps://github.com/dev/app/pull/12\n',
    }),
    {
      now: Date.now(),
      stateDir: join(ctx.root, 'state'),
      home: ctx.root,
      env: {},
      readPullRequest: buildStubPullRequestReader([
        {
          repository: 'github.com/dev/app',
          number: 12,
          head: 'feat/x',
          createdAt: startedAt - 3_600_000,
        },
      ]),
    },
  );

  expect(scope).toStrictEqual({ worktrees: [], branches: [], pullRequests: [] });
});

test('it records no PR printed for another repository', async () => {
  const ctx = await setupTest();

  runGit(ctx.root, ['-C', ctx.repo, 'remote', 'add', 'origin', 'git@github.com:dev/app.git']);

  const startedAt = Date.now();

  const scope = await updateSessionScope(
    buildMockScopeRecordRequest({
      cwd: ctx.repo,
      startedAt,
      command: 'gh pr create --fill',
      resultText: 'https://github.com/someone/app/pull/12\n',
    }),
    {
      now: Date.now(),
      stateDir: join(ctx.root, 'state'),
      home: ctx.root,
      env: {},
      readPullRequest: buildStubPullRequestReader([
        { repository: 'github.com/someone/app', number: 12, head: 'feat/x', createdAt: startedAt },
      ]),
    },
  );

  expect(scope).toStrictEqual({ worktrees: [], branches: [], pullRequests: [] });
});

test('it records no PR the forge does not know', async () => {
  const ctx = await setupTest();

  runGit(ctx.root, ['-C', ctx.repo, 'remote', 'add', 'origin', 'git@github.com:dev/app.git']);

  const scope = await updateSessionScope(
    buildMockScopeRecordRequest({
      cwd: ctx.repo,
      startedAt: Date.now(),
      command: 'gh pr create --fill',
      resultText: 'https://github.com/dev/app/pull/99\n',
    }),
    {
      now: Date.now(),
      stateDir: join(ctx.root, 'state'),
      home: ctx.root,
      env: {},
      readPullRequest: buildStubPullRequestReader([]),
    },
  );

  expect(scope).toStrictEqual({ worktrees: [], branches: [], pullRequests: [] });
});

test('it keeps every branch when calls of one session record at the same time', async () => {
  const ctx = await setupTest();

  const names = Array.from({ length: 10 }, (_, index) => `feat/${String(index)}`);
  const startedAt = Date.now();

  for (const name of names) {
    runGit(ctx.root, ['-C', ctx.repo, 'branch', name]);
  }

  const path = resolveSessionScopePath(join(ctx.root, 'state'), 'session-1');
  const lockClock = buildStubLockClock({ startAt: startedAt, advancesOnWait: false });

  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(`${path}.lock`, '');

  const recording = Promise.all(
    names.map((name) =>
      updateSessionScope(
        buildMockScopeRecordRequest({
          sessionID: 'session-1',
          cwd: ctx.repo,
          startedAt,
          command: `git branch ${name}`,
        }),
        {
          now: Date.now(),
          stateDir: join(ctx.root, 'state'),
          home: ctx.root,
          env: {},
          readPullRequest: buildStubPullRequestReader([]),
          lockClock,
        },
      ),
    ),
  );

  await lockClock.waited;

  const waitsWhileHeld = lockClock.wait.mock.calls.length;

  await rm(`${path}.lock`);
  await recording;

  const written = await loadSessionScope(path);

  expect(waitsWhileHeld).toBeGreaterThan(0);

  expect(written.branches).toIncludeSameMembers(
    names.map((name) => ({ name, commonDir: join(ctx.repo, '.git') })),
  );
});

test('it records nothing for a call that claims to have started long ago', async () => {
  const ctx = await setupTest();

  runGit(ctx.root, ['-C', ctx.repo, 'branch', 'feat/old']);

  const scope = await updateSessionScope(
    buildMockScopeRecordRequest({ cwd: ctx.repo, startedAt: 1, command: 'git branch feat/old' }),
    {
      now: Date.now(),
      stateDir: join(ctx.root, 'state'),
      home: ctx.root,
      env: {},
      readPullRequest: buildStubPullRequestReader([]),
    },
  );

  expect(scope).toStrictEqual({ worktrees: [], branches: [], pullRequests: [] });
});

test('it records every PR one call created', async () => {
  const ctx = await setupTest();

  runGit(ctx.root, ['-C', ctx.repo, 'remote', 'add', 'origin', 'git@github.com:dev/app.git']);

  const startedAt = Date.now();

  const scope = await updateSessionScope(
    buildMockScopeRecordRequest({
      cwd: ctx.repo,
      startedAt,
      command: 'gh pr create --head feat/a --fill && gh pr create --head feat/b --fill',
      resultText: 'https://github.com/dev/app/pull/3\nhttps://github.com/dev/app/pull/4\n',
    }),
    {
      now: Date.now(),
      stateDir: join(ctx.root, 'state'),
      home: ctx.root,
      env: {},
      readPullRequest: buildStubPullRequestReader([
        { repository: 'github.com/dev/app', number: 3, head: 'feat/a', createdAt: startedAt },
        { repository: 'github.com/dev/app', number: 4, head: 'feat/b', createdAt: startedAt },
      ]),
    },
  );

  expect(scope).toStrictEqual({
    worktrees: [],
    branches: [],
    pullRequests: [
      { repository: 'github.com/dev/app', number: 3, head: 'feat/a' },
      { repository: 'github.com/dev/app', number: 4, head: 'feat/b' },
    ],
  });
});
