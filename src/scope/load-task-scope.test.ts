import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildMockHostEnvironment } from '../../test-utils/factories/build-mock-host-environment.ts';
import { buildMockSessionScope } from '../../test-utils/factories/build-mock-session-scope.ts';
import { runGit } from '../../test-utils/run-git.ts';
import { readTextFile } from '../config/read-text-file.ts';
import { loadTaskScope } from './load-task-scope.ts';

async function setupTest(): Promise<{ readonly directory: string }> {
  const created = await mkdtemp(join(tmpdir(), 'auto-mode-scope-'));

  onTestFinished(() => rm(created, { recursive: true, force: true }));

  // git writes the real path of a linked worktree's git directory.
  return { directory: await realpath(created) };
}

test('it owns the linked worktree that holds the cwd, its branch, and the remotes', async () => {
  const ctx = await setupTest();

  const repo = join(ctx.directory, 'app');
  const worktree = join(repo, '.worktrees', 'feature');

  runGit(ctx.directory, ['init', '-q', '-b', 'main', repo]);
  runGit(ctx.directory, ['-C', repo, 'remote', 'add', 'origin', 'git@github.com:dev/app.git']);
  runGit(ctx.directory, ['-C', repo, 'commit', '-q', '--allow-empty', '-m', 'init']);
  runGit(ctx.directory, ['-C', repo, 'worktree', 'add', '-q', '-b', 'feature', worktree]);

  runGit(ctx.directory, [
    '-C',
    repo,
    'symbolic-ref',
    'refs/remotes/origin/HEAD',
    'refs/remotes/origin/main',
  ]);

  await mkdir(join(worktree, 'src'));

  const scope = await loadTaskScope(
    {
      sessionID: 'session-1',
      cwd: join(worktree, 'src'),
      stateDir: join(ctx.directory, 'state'),
      readTextFile,
    },
    { cwd: { kind: 'cwd' } },
    buildMockHostEnvironment({ env: {}, home: ctx.directory }),
    { write: mock() },
  );

  expect(scope).toStrictEqual({
    home: ctx.directory,
    worktrees: [worktree],
    branches: ['feature'],
    currentBranch: 'feature',
    remotes: [{ name: 'origin', url: 'git@github.com:dev/app.git' }],
    pullRequests: [],
    pathGlobs: [],
    paths: [],
    replyChannels: [],
  });
});

test('it owns the main checkout but not its default branch', async () => {
  const ctx = await setupTest();

  const repo = join(ctx.directory, 'app');

  runGit(ctx.directory, ['init', '-q', '-b', 'main', repo]);
  runGit(ctx.directory, ['-C', repo, 'remote', 'add', 'origin', 'git@github.com:dev/app.git']);

  runGit(ctx.directory, [
    '-C',
    repo,
    'symbolic-ref',
    'refs/remotes/origin/HEAD',
    'refs/remotes/origin/main',
  ]);

  const scope = await loadTaskScope(
    {
      sessionID: 'session-1',
      cwd: repo,
      stateDir: join(ctx.directory, 'state'),
      readTextFile,
    },
    { cwd: { kind: 'cwd' } },
    buildMockHostEnvironment({ env: {}, home: ctx.directory }),
    { write: mock() },
  );

  expect(scope).toStrictEqual({
    home: ctx.directory,
    worktrees: [repo],
    branches: [],
    currentBranch: 'main',
    remotes: [{ name: 'origin', url: 'git@github.com:dev/app.git' }],
    pullRequests: [],
    pathGlobs: [],
    paths: [],
    replyChannels: [],
  });
});

test('it owns only the cwd when git directory overrides hide the checkout', async () => {
  const ctx = await setupTest();

  const repo = join(ctx.directory, 'app');

  runGit(ctx.directory, ['init', '-q', '-b', 'main', repo]);
  runGit(ctx.directory, ['-C', repo, 'remote', 'add', 'origin', 'git@github.com:dev/app.git']);

  const scope = await loadTaskScope(
    {
      sessionID: 'session-1',
      cwd: repo,
      stateDir: join(ctx.directory, 'state'),
      readTextFile,
    },
    { cwd: { kind: 'cwd' } },
    buildMockHostEnvironment({ env: { GIT_DIR: join(repo, '.git') }, home: ctx.directory }),
    { write: mock() },
  );

  expect(scope).toStrictEqual({
    home: ctx.directory,
    worktrees: [repo],
    branches: [],
    currentBranch: null,
    remotes: [],
    pullRequests: [],
    pathGlobs: [],
    paths: [],
    replyChannels: [],
  });
});

test('it unites the sources and owns the PRs whose head branch and repository are in scope', async () => {
  const ctx = await setupTest();

  const repo = join(ctx.directory, 'app');
  const stateDir = join(ctx.directory, 'state');

  // The file name is the first 32 hex digits of `printf session-1 | sha256sum`.
  const path = join(stateDir, 'session-scope', '84097828fc31a8c8d29210df48901a85.json');

  runGit(ctx.directory, ['init', '-q', '-b', 'main', repo]);
  runGit(ctx.directory, ['-C', repo, 'remote', 'add', 'origin', 'git@github.com:dev/app.git']);

  runGit(ctx.directory, [
    '-C',
    repo,
    'symbolic-ref',
    'refs/remotes/origin/HEAD',
    'refs/remotes/origin/main',
  ]);

  await mkdir(dirname(path), { recursive: true });

  const recorded = buildMockSessionScope({
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
  });

  await writeFile(path, JSON.stringify(recorded));

  const scope = await loadTaskScope(
    {
      sessionID: 'session-1',
      cwd: repo,
      stateDir,
      readTextFile,
    },
    {
      cwd: { kind: 'cwd' },
      session: { kind: 'session' },
      scratch: { kind: 'globs', paths: ['/scratch/**'] },
    },
    buildMockHostEnvironment({ env: {}, home: ctx.directory }),
    { write: mock() },
  );

  expect(scope).toStrictEqual({
    home: ctx.directory,
    worktrees: [repo, join(repo, '.worktrees', 'docs')],
    branches: ['docs'],
    currentBranch: 'main',
    remotes: [{ name: 'origin', url: 'git@github.com:dev/app.git' }],
    pullRequests: [{ number: 7, repository: 'github.com/dev/app' }],
    pathGlobs: ['/scratch/**'],
    paths: [],
    replyChannels: [],
  });
});

test('it reads no session scope when the registry has no session source', async () => {
  const ctx = await setupTest();

  const repo = join(ctx.directory, 'app');
  const stateDir = join(ctx.directory, 'state');

  // The file name is the first 32 hex digits of `printf session-1 | sha256sum`.
  const path = join(stateDir, 'session-scope', '84097828fc31a8c8d29210df48901a85.json');

  runGit(ctx.directory, ['init', '-q', '-b', 'main', repo]);

  runGit(ctx.directory, [
    '-C',
    repo,
    'symbolic-ref',
    'refs/remotes/origin/HEAD',
    'refs/remotes/origin/main',
  ]);

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(buildMockSessionScope({ worktrees: ['/elsewhere'] })));

  const scope = await loadTaskScope(
    {
      sessionID: 'session-1',
      cwd: repo,
      stateDir,
      readTextFile,
    },
    { cwd: { kind: 'cwd' } },
    buildMockHostEnvironment({ env: {}, home: ctx.directory }),
    { write: mock() },
  );

  expect(scope).toStrictEqual({
    home: ctx.directory,
    worktrees: [repo],
    branches: [],
    currentBranch: 'main',
    remotes: [],
    pullRequests: [],
    pathGlobs: [],
    paths: [],
    replyChannels: [],
  });
});

test('it owns the scope file that the host environment names, from the main checkout', async () => {
  const ctx = await setupTest();

  const repo = join(ctx.directory, 'app');
  const worktree = join(repo, '.worktrees', 'feature');
  const scopeFilePath = join(ctx.directory, 'scope.json');

  runGit(ctx.directory, ['init', '-q', '-b', 'main', repo]);
  runGit(ctx.directory, ['-C', repo, 'commit', '-q', '--allow-empty', '-m', 'init']);
  runGit(ctx.directory, ['-C', repo, 'worktree', 'add', '-q', '-b', 'feature', worktree]);

  runGit(ctx.directory, [
    '-C',
    repo,
    'symbolic-ref',
    'refs/remotes/origin/HEAD',
    'refs/remotes/origin/main',
  ]);

  await writeFile(
    scopeFilePath,
    JSON.stringify({
      format: 'auto-mode.scope',
      version: 1,
      paths: ['/srv/notes'],
      workspace: { path: worktree, branch: 'feature' },
      replyChannels: [{ tool: 'SendMessage', field: 'to', recipient: 'lead' }],
    }),
  );

  const scope = await loadTaskScope(
    {
      sessionID: 'session-1',
      cwd: repo,
      stateDir: join(ctx.directory, 'state'),
      readTextFile,
    },
    { launcher: { kind: 'launcher' } },
    buildMockHostEnvironment({
      env: { AUTO_MODE_SCOPE_FILE: scopeFilePath },
      home: ctx.directory,
    }),
    { write: mock() },
  );

  expect(scope).toStrictEqual({
    home: ctx.directory,
    worktrees: [worktree],
    branches: ['feature'],
    currentBranch: 'main',
    remotes: [],
    pullRequests: [],
    pathGlobs: [],
    paths: ['/srv/notes'],
    replyChannels: [{ tool: 'SendMessage', field: 'to', recipient: 'lead' }],
  });
});

test('it never owns a recorded branch of another repository', async () => {
  const ctx = await setupTest();

  const repo = join(ctx.directory, 'app');
  const other = join(ctx.directory, 'other');
  const stateDir = join(ctx.directory, 'state');

  // The file name is the first 32 hex digits of `printf session-1 | sha256sum`.
  const path = join(stateDir, 'session-scope', '84097828fc31a8c8d29210df48901a85.json');

  runGit(ctx.directory, ['init', '-q', '-b', 'main', repo]);
  runGit(ctx.directory, ['init', '-q', '-b', 'main', other]);

  runGit(ctx.directory, [
    '-C',
    repo,
    'symbolic-ref',
    'refs/remotes/origin/HEAD',
    'refs/remotes/origin/main',
  ]);

  await mkdir(dirname(path), { recursive: true });

  const recorded = buildMockSessionScope({
    worktrees: [],
    branches: [
      { name: 'docs', commonDir: join(repo, '.git') },
      { name: 'elsewhere', commonDir: join(other, '.git') },
    ],
    pullRequests: [],
  });

  await writeFile(path, JSON.stringify(recorded));

  const scope = await loadTaskScope(
    {
      sessionID: 'session-1',
      cwd: repo,
      stateDir,
      readTextFile,
    },
    { session: { kind: 'session' } },
    buildMockHostEnvironment({ env: {}, home: ctx.directory }),
    { write: mock() },
  );

  expect(scope).toStrictEqual({
    home: ctx.directory,
    worktrees: [],
    branches: ['docs'],
    currentBranch: 'main',
    remotes: [],
    pullRequests: [],
    pathGlobs: [],
    paths: [],
    replyChannels: [],
  });
});
