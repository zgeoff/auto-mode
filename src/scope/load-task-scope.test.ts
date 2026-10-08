import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildMockAtcSessionRecord } from '../../test-utils/factories/build-mock-atc-session-record.ts';
import { runGit } from '../../test-utils/run-git.ts';
import { loadTaskScope } from './load-task-scope.ts';
import { resolveSessionScopePath } from './resolve-session-scope-path.ts';

async function setupTest(): Promise<{ readonly dir: string }> {
  const created = await mkdtemp(join(tmpdir(), 'auto-mode-scope-'));

  onTestFinished(() => rm(created, { recursive: true, force: true }));

  // git writes the real path of a linked worktree's git directory.
  return { dir: await realpath(created) };
}

test('it owns the linked worktree that holds the cwd, its branch, and the remotes', async () => {
  const ctx = await setupTest();

  const repo = join(ctx.dir, 'app');
  const worktree = join(repo, '.worktrees', 'feature');

  runGit(ctx.dir, ['init', '-q', '-b', 'main', repo]);
  runGit(ctx.dir, ['-C', repo, 'remote', 'add', 'origin', 'git@github.com:dev/app.git']);
  runGit(ctx.dir, ['-C', repo, 'commit', '-q', '--allow-empty', '-m', 'init']);
  runGit(ctx.dir, ['-C', repo, 'worktree', 'add', '-q', '-b', 'feature', worktree]);

  runGit(ctx.dir, [
    '-C',
    repo,
    'symbolic-ref',
    'refs/remotes/origin/HEAD',
    'refs/remotes/origin/main',
  ]);

  await mkdir(join(worktree, 'src'));

  const scope = await loadTaskScope(
    { sessionID: 'session-1', cwd: join(worktree, 'src'), stateDir: join(ctx.dir, 'state') },
    { cwd: { kind: 'cwd' } },
    { env: {}, home: ctx.dir },
  );

  expect(scope).toStrictEqual({
    home: ctx.dir,
    worktrees: [worktree],
    branches: ['feature'],
    currentBranch: 'feature',
    remotes: [{ name: 'origin', url: 'git@github.com:dev/app.git' }],
    pullRequests: [],
    pathGlobs: [],
  });
});

test('it owns the main checkout but not its default branch', async () => {
  const ctx = await setupTest();

  const repo = join(ctx.dir, 'app');

  runGit(ctx.dir, ['init', '-q', '-b', 'main', repo]);
  runGit(ctx.dir, ['-C', repo, 'remote', 'add', 'origin', 'git@github.com:dev/app.git']);

  runGit(ctx.dir, [
    '-C',
    repo,
    'symbolic-ref',
    'refs/remotes/origin/HEAD',
    'refs/remotes/origin/main',
  ]);

  const scope = await loadTaskScope(
    { sessionID: 'session-1', cwd: repo, stateDir: join(ctx.dir, 'state') },
    { cwd: { kind: 'cwd' } },
    { env: {}, home: ctx.dir },
  );

  expect(scope).toStrictEqual({
    home: ctx.dir,
    worktrees: [repo],
    branches: [],
    currentBranch: 'main',
    remotes: [{ name: 'origin', url: 'git@github.com:dev/app.git' }],
    pullRequests: [],
    pathGlobs: [],
  });
});

test('it owns only the cwd when git directory overrides hide the checkout', async () => {
  const ctx = await setupTest();

  const repo = join(ctx.dir, 'app');

  runGit(ctx.dir, ['init', '-q', '-b', 'main', repo]);
  runGit(ctx.dir, ['-C', repo, 'remote', 'add', 'origin', 'git@github.com:dev/app.git']);

  const scope = await loadTaskScope(
    { sessionID: 'session-1', cwd: repo, stateDir: join(ctx.dir, 'state') },
    { cwd: { kind: 'cwd' } },
    { env: { GIT_DIR: join(repo, '.git') }, home: ctx.dir },
  );

  expect(scope).toStrictEqual({
    home: ctx.dir,
    worktrees: [repo],
    branches: [],
    currentBranch: null,
    remotes: [],
    pullRequests: [],
    pathGlobs: [],
  });
});

test('it unites the sources and owns the PRs whose head branch and repository are in scope', async () => {
  const ctx = await setupTest();

  const repo = join(ctx.dir, 'app');
  const stateDir = join(ctx.dir, 'state');
  const path = resolveSessionScopePath(stateDir, 'session-1');

  runGit(ctx.dir, ['init', '-q', '-b', 'main', repo]);
  runGit(ctx.dir, ['-C', repo, 'remote', 'add', 'origin', 'git@github.com:dev/app.git']);

  runGit(ctx.dir, [
    '-C',
    repo,
    'symbolic-ref',
    'refs/remotes/origin/HEAD',
    'refs/remotes/origin/main',
  ]);

  await mkdir(dirname(path), { recursive: true });

  await writeFile(
    path,
    JSON.stringify({
      worktrees: [join(repo, '.worktrees', 'docs')],
      branches: [
        { name: 'docs', commonDir: join(repo, '.git') },
        { name: 'main', commonDir: join(repo, '.git') },
      ],
      pullRequests: [
        { number: 7, head: 'docs', repository: 'github.com/dev/app' },
        { number: 8, head: 'someone-else', repository: 'github.com/dev/app' },
        { number: 9, head: 'docs', repository: 'github.com/dev/other' },
      ],
    }),
  );

  const scope = await loadTaskScope(
    { sessionID: 'session-1', cwd: repo, stateDir },
    {
      cwd: { kind: 'cwd' },
      session: { kind: 'session' },
      scratch: { kind: 'globs', paths: ['/scratch/**'] },
    },
    { env: {}, home: ctx.dir },
  );

  expect(scope).toStrictEqual({
    home: ctx.dir,
    worktrees: [repo, join(repo, '.worktrees', 'docs')],
    branches: ['docs'],
    currentBranch: 'main',
    remotes: [{ name: 'origin', url: 'git@github.com:dev/app.git' }],
    pullRequests: [{ number: 7, repository: 'github.com/dev/app' }],
    pathGlobs: ['/scratch/**'],
  });
});

test('it reads no session scope when the registry has no session source', async () => {
  const ctx = await setupTest();

  const repo = join(ctx.dir, 'app');
  const stateDir = join(ctx.dir, 'state');
  const path = resolveSessionScopePath(stateDir, 'session-1');

  runGit(ctx.dir, ['init', '-q', '-b', 'main', repo]);

  runGit(ctx.dir, [
    '-C',
    repo,
    'symbolic-ref',
    'refs/remotes/origin/HEAD',
    'refs/remotes/origin/main',
  ]);

  await mkdir(dirname(path), { recursive: true });

  await writeFile(
    path,
    JSON.stringify({ worktrees: ['/elsewhere'], branches: [], pullRequests: [] }),
  );

  const scope = await loadTaskScope(
    { sessionID: 'session-1', cwd: repo, stateDir },
    { cwd: { kind: 'cwd' } },
    { env: {}, home: ctx.dir },
  );

  expect(scope).toStrictEqual({
    home: ctx.dir,
    worktrees: [repo],
    branches: [],
    currentBranch: 'main',
    remotes: [],
    pullRequests: [],
    pathGlobs: [],
  });
});

test('it owns the atc record that the host environment names, from the main checkout', async () => {
  const ctx = await setupTest();

  const repo = join(ctx.dir, 'app');
  const worktree = join(repo, '.worktrees', 'feature');
  const recordPath = join(ctx.dir, 'record.json');

  runGit(ctx.dir, ['init', '-q', '-b', 'main', repo]);
  runGit(ctx.dir, ['-C', repo, 'commit', '-q', '--allow-empty', '-m', 'init']);
  runGit(ctx.dir, ['-C', repo, 'worktree', 'add', '-q', '-b', 'feature', worktree]);

  runGit(ctx.dir, [
    '-C',
    repo,
    'symbolic-ref',
    'refs/remotes/origin/HEAD',
    'refs/remotes/origin/main',
  ]);

  await writeFile(
    recordPath,
    JSON.stringify(
      buildMockAtcSessionRecord({
        session: 'atc-1',
        scope: { workspace: { path: worktree, branch: 'feature' } },
      }),
    ),
  );

  const scope = await loadTaskScope(
    { sessionID: 'session-1', cwd: repo, stateDir: join(ctx.dir, 'state') },
    { atc: { kind: 'atc' } },
    { env: { ATC_SESSION_RECORD: recordPath, ATC_SESSION_ID: 'atc-1' }, home: ctx.dir },
  );

  expect(scope).toStrictEqual({
    home: ctx.dir,
    worktrees: [worktree],
    branches: ['feature'],
    currentBranch: 'main',
    remotes: [],
    pullRequests: [],
    pathGlobs: [],
  });
});
