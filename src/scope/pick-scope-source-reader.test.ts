import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildMockAtcSessionRecord } from '../../test-utils/factories/build-mock-atc-session-record.ts';
import { pickScopeSourceReader } from './pick-scope-source-reader.ts';
import { resolveSessionScopePath } from './resolve-session-scope-path.ts';

async function setupTest(): Promise<{ readonly dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-scope-source-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it owns the worktree and the branch of the cwd', async () => {
  const facts = await pickScopeSourceReader({ kind: 'cwd' })({
    env: {},
    sessionID: 'session-1',
    cwd: '/repo/.worktrees/feat/src',
    worktree: '/repo/.worktrees/feat',
    commonDir: '/repo/.git',
    branch: 'feat',
    stateDir: '/state',
    stderr: { write: mock() },
  });

  expect(facts).toStrictEqual({
    worktrees: ['/repo/.worktrees/feat'],
    branches: ['feat'],
    pullRequests: [],
    pathGlobs: [],
  });
});

test('it owns no branch from the cwd when the checkout has none checked out', async () => {
  const facts = await pickScopeSourceReader({ kind: 'cwd' })({
    env: {},
    sessionID: 'session-1',
    cwd: '/repo',
    worktree: '/repo',
    commonDir: '/repo/.git',
    branch: null,
    stateDir: '/state',
    stderr: { write: mock() },
  });

  expect(facts).toStrictEqual({
    worktrees: ['/repo'],
    branches: [],
    pullRequests: [],
    pathGlobs: [],
  });
});

test('it owns what the session recorded, keeping only the branches of the action repository', async () => {
  const ctx = await setupTest();

  const stateDir = join(ctx.dir, 'state');
  const path = resolveSessionScopePath(stateDir, 'session-1');

  await mkdir(dirname(path), { recursive: true });

  await writeFile(
    path,
    JSON.stringify({
      worktrees: ['/repo/.worktrees/docs'],
      branches: [
        { name: 'docs', commonDir: '/repo/.git' },
        { name: 'elsewhere', commonDir: '/other/.git' },
      ],
      pullRequests: [{ number: 7, head: 'docs', repository: 'github.com/dev/app' }],
    }),
  );

  const facts = await pickScopeSourceReader({ kind: 'session' })({
    env: {},
    sessionID: 'session-1',
    cwd: '/repo',
    worktree: '/repo',
    commonDir: '/repo/.git',
    branch: 'main',
    stateDir,
    stderr: { write: mock() },
  });

  expect(facts).toStrictEqual({
    worktrees: ['/repo/.worktrees/docs'],
    branches: ['docs'],
    pullRequests: [{ number: 7, head: 'docs', repository: 'github.com/dev/app' }],
    pathGlobs: [],
  });
});

test("it owns nothing from another session's recorded scope", async () => {
  const ctx = await setupTest();

  const stateDir = join(ctx.dir, 'state');
  const path = resolveSessionScopePath(stateDir, 'session-1');

  await mkdir(dirname(path), { recursive: true });

  await writeFile(
    path,
    JSON.stringify({ worktrees: ['/elsewhere'], branches: [], pullRequests: [] }),
  );

  const facts = await pickScopeSourceReader({ kind: 'session' })({
    env: {},
    sessionID: 'session-2',
    cwd: '/repo',
    worktree: '/repo',
    commonDir: '/repo/.git',
    branch: 'main',
    stateDir,
    stderr: { write: mock() },
  });

  expect(facts).toStrictEqual({ worktrees: [], branches: [], pullRequests: [], pathGlobs: [] });
});

test('it owns the configured path globs', async () => {
  const facts = await pickScopeSourceReader({ kind: 'globs', paths: ['/scratch/**'] })({
    env: {},
    sessionID: 'session-1',
    cwd: '/repo',
    worktree: '/repo',
    commonDir: '/repo/.git',
    branch: 'main',
    stateDir: '/state',
    stderr: { write: mock() },
  });

  expect(facts).toStrictEqual({
    worktrees: [],
    branches: [],
    pullRequests: [],
    pathGlobs: ['/scratch/**'],
  });
});

test('it owns no path glob when the globs source lists no paths', async () => {
  const facts = await pickScopeSourceReader({ kind: 'globs' })({
    env: {},
    sessionID: 'session-1',
    cwd: '/repo',
    worktree: '/repo',
    commonDir: '/repo/.git',
    branch: 'main',
    stateDir: '/state',
    stderr: { write: mock() },
  });

  expect(facts).toStrictEqual({ worktrees: [], branches: [], pullRequests: [], pathGlobs: [] });
});

test('it owns the atc checkouts and only the branches that share the action repository', async () => {
  const ctx = await setupTest();

  const repo = join(ctx.dir, 'repo');
  const other = join(ctx.dir, 'other');
  const recordPath = join(ctx.dir, 'record.json');

  await mkdir(join(repo, '.git'), { recursive: true });
  await mkdir(join(other, '.git'), { recursive: true });

  const record = buildMockAtcSessionRecord({
    session: 'atc-1',
    scope: {
      workspace: { path: `${repo}/.worktrees/feat`, branch: 'feat' },
      worktrees: [{ path: `${other}/.worktrees/x`, branch: 'x' }],
      branches: [
        { name: 'later', repo },
        { name: 'elsewhere', repo: other },
      ],
      pullRequests: [{ repo: 'dev/app', number: 12, branch: 'feat' }],
    },
  });

  await writeFile(recordPath, JSON.stringify(record));

  const facts = await pickScopeSourceReader({ kind: 'atc' })({
    env: {},
    sessionID: 'session-1',
    cwd: repo,
    worktree: repo,
    commonDir: join(repo, '.git'),
    branch: 'main',
    stateDir: join(ctx.dir, 'state'),
    atcRecordPath: recordPath,
    atcSessionID: 'atc-1',
    stderr: { write: mock() },
  });

  expect(facts).toStrictEqual({
    worktrees: [join(repo, '.worktrees', 'feat'), join(other, '.worktrees', 'x')],
    branches: ['feat', 'later'],
    pullRequests: [{ number: 12, head: 'feat', repository: 'github.com/dev/app' }],
    pathGlobs: [],
  });
});

test('it owns no atc branch when the action is outside every checkout', async () => {
  const ctx = await setupTest();

  const repo = join(ctx.dir, 'repo');
  const recordPath = join(ctx.dir, 'record.json');

  await mkdir(join(repo, '.git'), { recursive: true });

  await writeFile(
    recordPath,
    JSON.stringify(
      buildMockAtcSessionRecord({
        session: 'atc-1',
        scope: { workspace: { path: repo, branch: 'feat' } },
      }),
    ),
  );

  const facts = await pickScopeSourceReader({ kind: 'atc' })({
    env: {},
    sessionID: 'session-1',
    cwd: '/elsewhere',
    worktree: '/elsewhere',
    commonDir: null,
    branch: null,
    stateDir: join(ctx.dir, 'state'),
    atcRecordPath: recordPath,
    atcSessionID: 'atc-1',
    stderr: { write: mock() },
  });

  expect(facts).toStrictEqual({ worktrees: [repo], branches: [], pullRequests: [], pathGlobs: [] });
});

test('it owns nothing from an atc record of another version', async () => {
  const ctx = await setupTest();

  const recordPath = join(ctx.dir, 'record.json');

  await writeFile(
    recordPath,
    JSON.stringify({ ...buildMockAtcSessionRecord({ session: 'atc-1' }), version: 2 }),
  );

  const facts = await pickScopeSourceReader({ kind: 'atc' })({
    env: {},
    sessionID: 'session-1',
    cwd: '/repo',
    worktree: '/repo',
    commonDir: '/repo/.git',
    branch: 'main',
    stateDir: join(ctx.dir, 'state'),
    atcRecordPath: recordPath,
    atcSessionID: 'atc-1',
    stderr: { write: mock() },
  });

  expect(facts).toStrictEqual({ worktrees: [], branches: [], pullRequests: [], pathGlobs: [] });
});

test('it writes one diagnostic line for an atc record of another version', async () => {
  const ctx = await setupTest();

  const recordPath = join(ctx.dir, 'record.json');
  const write = mock();

  await writeFile(
    recordPath,
    JSON.stringify({ ...buildMockAtcSessionRecord({ session: 'atc-1' }), version: 2 }),
  );

  await pickScopeSourceReader({ kind: 'atc' })({
    env: {},
    sessionID: 'session-1',
    cwd: '/repo',
    worktree: '/repo',
    commonDir: '/repo/.git',
    branch: 'main',
    stateDir: join(ctx.dir, 'state'),
    atcRecordPath: recordPath,
    atcSessionID: 'atc-1',
    stderr: { write },
  });

  expect(write).toHaveBeenCalledExactlyOnceWith(
    `auto-mode: atc session record ignored: version does not match version 1: ${recordPath}\n`,
  );
});

test('it owns nothing from atc when the session has no record', async () => {
  const facts = await pickScopeSourceReader({ kind: 'atc' })({
    env: {},
    sessionID: 'session-1',
    cwd: '/repo',
    worktree: '/repo',
    commonDir: '/repo/.git',
    branch: 'main',
    stateDir: '/state',
    stderr: { write: mock() },
  });

  expect(facts).toStrictEqual({ worktrees: [], branches: [], pullRequests: [], pathGlobs: [] });
});

test('it writes no diagnostic when the session has no atc record', async () => {
  const write = mock();

  await pickScopeSourceReader({ kind: 'atc' })({
    env: {},
    sessionID: 'session-1',
    cwd: '/repo',
    worktree: '/repo',
    commonDir: '/repo/.git',
    branch: 'main',
    stateDir: '/state',
    stderr: { write },
  });

  expect(write).not.toHaveBeenCalled();
});
