import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMockConfig } from '../test-utils/factories/build-mock-config.ts';
import { buildMockRuntime } from '../test-utils/factories/build-mock-runtime.ts';
import { buildMockScopeRecordRequest } from '../test-utils/factories/build-mock-scope-record-request.ts';
import { runGit } from '../test-utils/run-git.ts';
import { recordScope } from './record-scope.ts';
import { loadSessionScope } from './scope/load-session-scope.ts';
import { resolveSessionScopePath } from './scope/resolve-session-scope-path.ts';

async function setupTest(): Promise<{ readonly dir: string; readonly repo: string }> {
  const created = await mkdtemp(join(tmpdir(), 'auto-mode-record-scope-'));

  onTestFinished(() => rm(created, { recursive: true, force: true }));

  const dir = await realpath(created);

  const repo = join(dir, 'repo');

  // The checkout search walks up from the cwd and would stop at any .git
  // above the temp root, so the repo is a checkout of its own.
  runGit(dir, ['init', '-q', '-b', 'main', repo]);
  runGit(dir, ['-C', repo, 'commit', '-q', '--allow-empty', '-m', 'init']);

  return { dir, repo };
}

test('it adds a worktree the session created to its scope', async () => {
  const ctx = await setupTest();

  const startedAt = Date.now();

  runGit(ctx.dir, ['-C', ctx.repo, 'worktree', 'add', '-q', '.worktrees/x', '-b', 'feat/x']);

  const recorded = await recordScope(
    buildMockScopeRecordRequest({
      sessionID: 'record-session',
      cwd: ctx.repo,
      startedAt,
      command: 'git worktree add .worktrees/x -b feat/x',
      resultText: '',
    }),
    buildMockConfig(),
    buildMockRuntime({
      env: { PATH: process.env['PATH'], XDG_STATE_HOME: ctx.dir },
      home: ctx.dir,
    }),
  );

  const kept = await loadSessionScope(
    resolveSessionScopePath(join(ctx.dir, 'auto-mode'), 'record-session'),
  );

  expect(recorded).toStrictEqual({
    worktrees: [join(ctx.repo, '.worktrees', 'x')],
    branches: [{ name: 'feat/x', commonDir: join(ctx.repo, '.git') }],
    pullRequests: [],
  });

  expect(kept).toStrictEqual(recorded);
});

test('it records nothing when no session scope source is configured', async () => {
  const ctx = await setupTest();

  const startedAt = Date.now();

  runGit(ctx.dir, ['-C', ctx.repo, 'worktree', 'add', '-q', '.worktrees/x', '-b', 'feat/x']);

  const recorded = await recordScope(
    buildMockScopeRecordRequest({
      sessionID: 'record-session',
      cwd: ctx.repo,
      startedAt,
      command: 'git worktree add .worktrees/x -b feat/x',
      resultText: '',
    }),
    { ...buildMockConfig(), scopeSources: { cwd: { kind: 'cwd' } } },
    buildMockRuntime({
      env: { PATH: process.env['PATH'], XDG_STATE_HOME: ctx.dir },
      home: ctx.dir,
    }),
  );

  const kept = await loadSessionScope(
    resolveSessionScopePath(join(ctx.dir, 'auto-mode'), 'record-session'),
  );

  expect(recorded).toStrictEqual({ worktrees: [], branches: [], pullRequests: [] });
  expect(kept).toStrictEqual({ worktrees: [], branches: [], pullRequests: [] });
});
