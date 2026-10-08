import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildMockAtcSessionRecord } from '../../test-utils/factories/build-mock-atc-session-record.ts';
import { buildMockScopeSourceContext } from '../../test-utils/factories/build-mock-scope-source-context.ts';
import { pickScopeSourceReader } from './pick-scope-source-reader.ts';
import { resolveSessionScopePath } from './resolve-session-scope-path.ts';

async function setupTest(): Promise<{ readonly dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-scope-source-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it owns the worktree and the branch of the cwd', async () => {
  const facts = await pickScopeSourceReader({ kind: 'cwd' })(
    buildMockScopeSourceContext({ worktree: '/repo/.worktrees/feat', branch: 'feat' }),
  );

  expect(facts).toStrictEqual({
    worktrees: ['/repo/.worktrees/feat'],
    branches: ['feat'],
    pullRequests: [],
    pathGlobs: [],
  });
});

test('it owns no branch from the cwd when the checkout has none checked out', async () => {
  const facts = await pickScopeSourceReader({ kind: 'cwd' })(
    buildMockScopeSourceContext({ worktree: '/repo', branch: null }),
  );

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

  const facts = await pickScopeSourceReader({ kind: 'session' })(
    buildMockScopeSourceContext({ sessionID: 'session-1', commonDir: '/repo/.git', stateDir }),
  );

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

  const facts = await pickScopeSourceReader({ kind: 'session' })(
    buildMockScopeSourceContext({ sessionID: 'session-2', stateDir }),
  );

  expect(facts).toStrictEqual({ worktrees: [], branches: [], pullRequests: [], pathGlobs: [] });
});

test('it owns the configured path globs', async () => {
  const facts = await pickScopeSourceReader({ kind: 'globs', paths: ['/scratch/**'] })(
    buildMockScopeSourceContext(),
  );

  expect(facts).toStrictEqual({
    worktrees: [],
    branches: [],
    pullRequests: [],
    pathGlobs: ['/scratch/**'],
  });
});

test('it owns no path glob when the globs source lists no paths', async () => {
  const facts = await pickScopeSourceReader({ kind: 'globs' })(buildMockScopeSourceContext());

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

  const facts = await pickScopeSourceReader({ kind: 'atc' })(
    buildMockScopeSourceContext({
      commonDir: join(repo, '.git'),
      atcRecordPath: recordPath,
      atcSessionID: 'atc-1',
    }),
  );

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

  const facts = await pickScopeSourceReader({ kind: 'atc' })(
    buildMockScopeSourceContext({
      commonDir: null,
      atcRecordPath: recordPath,
      atcSessionID: 'atc-1',
    }),
  );

  expect(facts).toStrictEqual({ worktrees: [repo], branches: [], pullRequests: [], pathGlobs: [] });
});

test('it owns nothing from an atc record of another version', async () => {
  const ctx = await setupTest();

  const recordPath = join(ctx.dir, 'record.json');

  await writeFile(
    recordPath,
    JSON.stringify({ ...buildMockAtcSessionRecord({ session: 'atc-1' }), version: 2 }),
  );

  const facts = await pickScopeSourceReader({ kind: 'atc' })(
    buildMockScopeSourceContext({ atcRecordPath: recordPath, atcSessionID: 'atc-1' }),
  );

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

  await pickScopeSourceReader({ kind: 'atc' })(
    buildMockScopeSourceContext({
      atcRecordPath: recordPath,
      atcSessionID: 'atc-1',
      stderr: { write },
    }),
  );

  expect(write).toHaveBeenCalledExactlyOnceWith(
    `auto-mode: atc session record ignored: version does not match version 1: ${recordPath}\n`,
  );
});

test('it owns nothing from atc when the session has no record', async () => {
  const facts = await pickScopeSourceReader({ kind: 'atc' })(
    buildMockScopeSourceContext({ atcRecordPath: undefined }),
  );

  expect(facts).toStrictEqual({ worktrees: [], branches: [], pullRequests: [], pathGlobs: [] });
});

test('it writes no diagnostic when the session has no atc record', async () => {
  const write = mock();

  await pickScopeSourceReader({ kind: 'atc' })(
    buildMockScopeSourceContext({ atcRecordPath: undefined, stderr: { write } }),
  );

  expect(write).not.toHaveBeenCalled();
});
