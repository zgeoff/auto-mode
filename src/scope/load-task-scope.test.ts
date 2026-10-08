import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { loadTaskScope } from './load-task-scope.ts';
import { resolveSessionScopePath } from './resolve-session-scope-path.ts';

async function setupTest(): Promise<{
  readonly root: string;
  readonly worktree: string;
  readonly stateDir: string;
}> {
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

  return { root, worktree, stateDir: join(root, 'state') };
}

test('it owns the linked worktree that holds the cwd, its branch, and the remotes', async () => {
  const ctx = await setupTest();

  const scope = await loadTaskScope(
    { sessionID: 'session-1', cwd: join(ctx.worktree, 'src'), stateDir: ctx.stateDir },
    { cwd: { kind: 'cwd' } },
  );

  expect(scope).toStrictEqual({
    home: homedir(),
    worktrees: [ctx.worktree],
    branches: ['feature'],
    currentBranch: 'feature',
    remotes: [{ name: 'origin', url: 'git@github.com:dev/app.git' }],
    pullRequests: [],
    pathGlobs: [],
  });
});

test('it owns the main checkout but not its default branch', async () => {
  const ctx = await setupTest();

  const scope = await loadTaskScope(
    { sessionID: 'session-1', cwd: ctx.root, stateDir: ctx.stateDir },
    { cwd: { kind: 'cwd' } },
  );

  expect([scope.worktrees, scope.branches, scope.currentBranch]).toStrictEqual([
    [ctx.root],
    [],
    'main',
  ]);
});

test('it owns only the cwd when git directory overrides hide the checkout', async () => {
  const ctx = await setupTest();

  process.env['GIT_DIR'] = join(ctx.root, '.git');

  const scope = await loadTaskScope(
    { sessionID: 'session-1', cwd: ctx.worktree, stateDir: ctx.stateDir },
    { cwd: { kind: 'cwd' } },
  );

  expect(scope).toStrictEqual({
    home: homedir(),
    worktrees: [ctx.worktree],
    branches: [],
    currentBranch: null,
    remotes: [],
    pullRequests: [],
    pathGlobs: [],
  });
});

test('it adds what the session recorded and the PRs whose head branch is in scope', async () => {
  const ctx = await setupTest();

  const path = resolveSessionScopePath(ctx.stateDir, 'session-1');

  await mkdir(dirname(path), { recursive: true });

  await writeFile(
    path,
    JSON.stringify({
      worktrees: [join(ctx.root, '.worktrees', 'docs')],
      branches: ['docs', 'main'],
      pullRequests: [
        { number: 7, head: 'docs', repository: 'github.com/dev/app' },
        { number: 8, head: 'someone-else', repository: 'github.com/dev/app' },
        { number: 9, head: 'docs', repository: 'github.com/dev/other' },
      ],
    }),
  );

  const scope = await loadTaskScope(
    { sessionID: 'session-1', cwd: ctx.root, stateDir: ctx.stateDir },
    { cwd: { kind: 'cwd' }, session: { kind: 'session' } },
  );

  expect([scope.worktrees, scope.branches, scope.pullRequests]).toStrictEqual([
    [ctx.root, join(ctx.root, '.worktrees', 'docs')],
    ['docs'],
    [7],
  ]);
});

test('it reads no session scope when the registry has no session source', async () => {
  const ctx = await setupTest();

  const path = resolveSessionScopePath(ctx.stateDir, 'session-1');

  await mkdir(dirname(path), { recursive: true });

  await writeFile(
    path,
    JSON.stringify({ worktrees: ['/elsewhere'], branches: [], pullRequests: [] }),
  );

  const scope = await loadTaskScope(
    { sessionID: 'session-1', cwd: ctx.root, stateDir: ctx.stateDir },
    { cwd: { kind: 'cwd' } },
  );

  expect(scope.worktrees).toStrictEqual([ctx.root]);
});

test("it reads another session's recorded scope as nothing", async () => {
  const ctx = await setupTest();

  const path = resolveSessionScopePath(ctx.stateDir, 'session-1');

  await mkdir(dirname(path), { recursive: true });

  await writeFile(
    path,
    JSON.stringify({ worktrees: ['/elsewhere'], branches: [], pullRequests: [] }),
  );

  const scope = await loadTaskScope(
    { sessionID: 'session-2', cwd: ctx.root, stateDir: ctx.stateDir },
    { cwd: { kind: 'cwd' }, session: { kind: 'session' } },
  );

  expect(scope.worktrees).toStrictEqual([ctx.root]);
});

test('it adds the configured path globs', async () => {
  const ctx = await setupTest();

  const scope = await loadTaskScope(
    { sessionID: 'session-1', cwd: ctx.root, stateDir: ctx.stateDir },
    { cwd: { kind: 'cwd' }, scratch: { kind: 'globs', paths: ['/scratch/**'] } },
  );

  expect(scope.pathGlobs).toStrictEqual(['/scratch/**']);
});
