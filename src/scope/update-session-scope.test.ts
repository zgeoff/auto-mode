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

  const repo = join(root, 'repo');

  const runGit = (...args: readonly string[]): string =>
    execFileSync(
      'git',
      [
        '-c',
        'user.name=dev',
        '-c',
        'user.email=dev@example.com',
        '-c',
        'commit.gpgsign=false',
        ...args,
      ],
      {
        cwd: repo,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' },
      },
    );

  execFileSync('git', ['init', '-q', '-b', 'main', repo]);
  runGit('commit', '-q', '--allow-empty', '-m', 'init');
  runGit('remote', 'add', 'origin', 'git@github.com:dev/app.git');

  // The recorder confirms each claim against a forge lookup; this stands in
  // for `gh pr view` with the head branches the forge would report.
  const heads = new Map([['github.com/dev/app#12', 'feat/x']]);

  const options = {
    stateDir: join(root, 'state'),
    home: root,
    readPullRequestHead: (repository: string, number: number) =>
      Promise.resolve(heads.get(`${repository}#${String(number)}`) ?? null),
  };

  return { repo, runGit, options };
}

test('it records a worktree and its branch made during the call, and a later load reads them', async () => {
  const ctx = await setupTest();

  const startedAt = Date.now();
  const command = 'git worktree add .worktrees/x -b feat/x';

  ctx.runGit(...command.split(' ').slice(1));

  await updateSessionScope(
    { sessionID: 'session-1', cwd: ctx.repo, startedAt, command, resultText: '' },
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

test('it records no worktree or branch that existed before the call started', async () => {
  const ctx = await setupTest();

  const command = 'git worktree add .worktrees/x -b feat/x; git checkout -b feat/y';

  ctx.runGit('worktree', 'add', '.worktrees/x', '-b', 'feat/x');
  ctx.runGit('branch', 'feat/y');

  const facts = await updateSessionScope(
    {
      sessionID: 'session-1',
      cwd: ctx.repo,
      startedAt: Date.now() + 5000,
      command,
      resultText: '',
    },
    ctx.options,
  );

  expect(facts).toStrictEqual({ worktrees: [], branches: [], pullRequests: [], pathGlobs: [] });
});

test('it records a branch reset by checkout -B as nothing, since it already existed', async () => {
  const ctx = await setupTest();

  ctx.runGit('branch', 'feat/y');

  const startedAt = Date.now() + 5000;

  const facts = await updateSessionScope(
    {
      sessionID: 'session-1',
      cwd: ctx.repo,
      startedAt,
      command: 'git checkout -B feat/y',
      resultText: '',
    },
    ctx.options,
  );

  expect(facts.branches).toStrictEqual([]);
});

test('it records a created PR with the head branch the forge reports', async () => {
  const ctx = await setupTest();

  const facts = await updateSessionScope(
    {
      sessionID: 'session-1',
      cwd: ctx.repo,
      startedAt: Date.now(),
      command: 'gh pr create --fill',
      resultText: 'https://github.com/dev/app/pull/12\n',
    },
    ctx.options,
  );

  expect(facts.pullRequests).toStrictEqual([
    { number: 12, head: 'feat/x', repository: 'github.com/dev/app' },
  ]);
});

test('it records no PR printed for another repository', async () => {
  const ctx = await setupTest();

  const facts = await updateSessionScope(
    {
      sessionID: 'session-1',
      cwd: ctx.repo,
      startedAt: Date.now(),
      command: 'gh pr create --fill',
      resultText: 'https://github.com/someone/app/pull/12\n',
    },
    ctx.options,
  );

  expect(facts.pullRequests).toStrictEqual([]);
});

test('it records no PR the forge does not know', async () => {
  const ctx = await setupTest();

  const facts = await updateSessionScope(
    {
      sessionID: 'session-1',
      cwd: ctx.repo,
      startedAt: Date.now(),
      command: 'gh pr create --fill',
      resultText: 'https://github.com/dev/app/pull/99\n',
    },
    ctx.options,
  );

  expect(facts.pullRequests).toStrictEqual([]);
});
