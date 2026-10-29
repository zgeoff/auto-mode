import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildStubCheckoutReader } from '../../test-utils/build-stub-checkout-reader.ts';
import { buildMockScopeSourceContext } from '../../test-utils/factories/build-mock-scope-source-context.ts';
import { buildMockSessionScope } from '../../test-utils/factories/build-mock-session-scope.ts';
import { makeScopeSourceReader } from './make-scope-source-reader.ts';

async function setupTest(): Promise<{ readonly directory: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'auto-mode-scope-source-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it owns the worktree and the branch of the cwd', async () => {
  const facts = await makeScopeSourceReader({ kind: 'cwd' })(
    buildMockScopeSourceContext({ worktree: '/repo/.worktrees/feat', branch: 'feat' }),
  );

  expect(facts).toStrictEqual({
    worktrees: ['/repo/.worktrees/feat'],
    branches: ['feat'],
    pullRequests: [],
    pathGlobs: [],
    paths: [],
    replyChannels: [],
  });
});

test('it owns no branch from the cwd when the checkout has none checked out', async () => {
  const facts = await makeScopeSourceReader({ kind: 'cwd' })(
    buildMockScopeSourceContext({ worktree: '/repo', branch: null }),
  );

  expect(facts).toStrictEqual({
    worktrees: ['/repo'],
    branches: [],
    pullRequests: [],
    pathGlobs: [],
    paths: [],
    replyChannels: [],
  });
});

test('it owns what the session recorded, keeping only the branches of the action repository', async () => {
  const ctx = await setupTest();

  const stateDir = join(ctx.directory, 'state');

  // The file name is the first 32 hex digits of `printf session-1 | sha256sum`.
  const path = join(stateDir, 'session-scope', '84097828fc31a8c8d29210df48901a85.json');

  await mkdir(dirname(path), { recursive: true });

  await writeFile(
    path,
    JSON.stringify(
      buildMockSessionScope({
        worktrees: ['/repo/.worktrees/docs'],
        branches: [
          { name: 'docs', commonDir: '/repo/.git' },
          { name: 'elsewhere', commonDir: '/other/.git' },
        ],
        pullRequests: [{ number: 7, head: 'docs', repository: 'github.com/dev/app' }],
      }),
    ),
  );

  const facts = await makeScopeSourceReader({ kind: 'session' })(
    buildMockScopeSourceContext({ sessionID: 'session-1', commonDir: '/repo/.git', stateDir }),
  );

  expect(facts).toStrictEqual({
    worktrees: ['/repo/.worktrees/docs'],
    branches: ['docs'],
    pullRequests: [{ number: 7, head: 'docs', repository: 'github.com/dev/app' }],
    pathGlobs: [],
    paths: [],
    replyChannels: [],
  });
});

test("it owns nothing from another session's recorded scope", async () => {
  const ctx = await setupTest();

  const stateDir = join(ctx.directory, 'state');

  // The file name is the first 32 hex digits of `printf session-1 | sha256sum`.
  const path = join(stateDir, 'session-scope', '84097828fc31a8c8d29210df48901a85.json');

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(buildMockSessionScope({ worktrees: ['/elsewhere'] })));

  const facts = await makeScopeSourceReader({ kind: 'session' })(
    buildMockScopeSourceContext({ sessionID: 'session-2', stateDir }),
  );

  expect(facts).toStrictEqual({
    worktrees: [],
    branches: [],
    pullRequests: [],
    pathGlobs: [],
    paths: [],
    replyChannels: [],
  });
});

test('it owns the configured path globs', async () => {
  const facts = await makeScopeSourceReader({ kind: 'globs', paths: ['/scratch/**'] })(
    buildMockScopeSourceContext(),
  );

  expect(facts).toStrictEqual({
    worktrees: [],
    branches: [],
    pullRequests: [],
    pathGlobs: ['/scratch/**'],
    paths: [],
    replyChannels: [],
  });
});

test('it owns no path glob when the globs source lists no paths', async () => {
  const facts = await makeScopeSourceReader({ kind: 'globs' })(buildMockScopeSourceContext());

  expect(facts).toStrictEqual({
    worktrees: [],
    branches: [],
    pullRequests: [],
    pathGlobs: [],
    paths: [],
    replyChannels: [],
  });
});

test('it owns the launcher checkouts on disk and only the branches that share the action repository', async () => {
  const ctx = await setupTest();

  const repo = join(ctx.directory, 'repo');
  const other = join(ctx.directory, 'other');
  const scopeFilePath = join(ctx.directory, 'scope.json');

  await mkdir(join(repo, '.git'), { recursive: true });
  await mkdir(join(other, '.git'), { recursive: true });

  await writeFile(
    scopeFilePath,
    JSON.stringify({
      format: 'auto-mode.scope',
      version: 1,
      workspace: { path: `${repo}/.worktrees/feat`, branch: 'feat' },
      worktrees: [{ path: `${other}/.worktrees/x`, branch: 'x' }],
      branches: [
        { name: 'later', repo },
        { name: 'elsewhere', repo: other },
      ],
      pullRequests: [{ repo: 'dev/app', number: 12, branch: 'feat' }],
    }),
  );

  const facts = await makeScopeSourceReader({ kind: 'launcher' })(
    buildMockScopeSourceContext({ commonDir: join(repo, '.git'), scopeFilePath }),
  );

  expect(facts).toStrictEqual({
    worktrees: [join(repo, '.worktrees', 'feat'), join(other, '.worktrees', 'x')],
    branches: ['feat', 'later'],
    pullRequests: [{ number: 12, head: 'feat', repository: 'github.com/dev/app' }],
    pathGlobs: [],
    paths: [],
    replyChannels: [],
  });
});

test('it owns no launcher branch when the action is outside every checkout', async () => {
  const ctx = await setupTest();

  const repo = join(ctx.directory, 'repo');
  const scopeFilePath = join(ctx.directory, 'scope.json');

  await mkdir(join(repo, '.git'), { recursive: true });

  await writeFile(
    scopeFilePath,
    JSON.stringify({
      format: 'auto-mode.scope',
      version: 1,
      workspace: { path: repo, branch: 'feat' },
    }),
  );

  const facts = await makeScopeSourceReader({ kind: 'launcher' })(
    buildMockScopeSourceContext({ commonDir: null, scopeFilePath }),
  );

  expect(facts).toStrictEqual({
    worktrees: [repo],
    branches: [],
    pullRequests: [],
    pathGlobs: [],
    paths: [],
    replyChannels: [],
  });
});

test('it writes no diagnostic when the session names no scope file', async () => {
  const write = mock();

  await makeScopeSourceReader({ kind: 'launcher' })(
    buildMockScopeSourceContext({ scopeFilePath: undefined, stderr: { write } }),
  );

  expect(write).not.toHaveBeenCalled();
});

test('it owns what the launcher scope file declares, keeping only the branches of the action repository', async () => {
  const ctx = await setupTest();

  const scopeFilePath = join(ctx.directory, 'scope.json');

  await writeFile(
    scopeFilePath,
    JSON.stringify({
      format: 'auto-mode.scope',
      version: 1,
      paths: ['/srv/notes'],
      workspace: { path: '/w/app', branch: 'feat' },
      worktrees: [{ path: '/w/lib', branch: 'lib-feat' }],
      branches: [{ name: 'later' }, { name: 'elsewhere', repo: '/w/lib' }],
      pullRequests: [{ repo: 'dev/app', number: 12, branch: 'feat' }],
      replyChannels: [{ tool: 'SendMessage', field: 'to', recipient: 'lead' }],
    }),
  );

  const facts = await makeScopeSourceReader(
    { kind: 'launcher' },
    buildStubCheckoutReader({ '/w/app': '/w/app/.git', '/w/lib': '/w/lib/.git' }).readCheckout,
  )(buildMockScopeSourceContext({ commonDir: '/w/app/.git', scopeFilePath }));

  expect(facts).toStrictEqual({
    worktrees: ['/w/app', '/w/lib'],
    branches: ['feat', 'later'],
    pullRequests: [{ number: 12, head: 'feat', repository: 'github.com/dev/app' }],
    pathGlobs: [],
    paths: ['/srv/notes'],
    replyChannels: [{ tool: 'SendMessage', field: 'to', recipient: 'lead' }],
  });
});

test('it owns nothing from the launcher when the session names no scope file', async () => {
  const facts = await makeScopeSourceReader({ kind: 'launcher' })(
    buildMockScopeSourceContext({ scopeFilePath: undefined }),
  );

  expect(facts).toStrictEqual({
    worktrees: [],
    branches: [],
    pullRequests: [],
    pathGlobs: [],
    paths: [],
    replyChannels: [],
  });
});

test('it owns nothing from a launcher scope file of another version', async () => {
  const ctx = await setupTest();

  const scopeFilePath = join(ctx.directory, 'scope.json');

  await writeFile(
    scopeFilePath,
    JSON.stringify({ format: 'auto-mode.scope', version: 2, paths: ['/srv/notes'] }),
  );

  const facts = await makeScopeSourceReader({ kind: 'launcher' })(
    buildMockScopeSourceContext({ scopeFilePath }),
  );

  expect(facts).toStrictEqual({
    worktrees: [],
    branches: [],
    pullRequests: [],
    pathGlobs: [],
    paths: [],
    replyChannels: [],
  });
});

test('it writes one diagnostic line for a launcher scope file of another version', async () => {
  const ctx = await setupTest();

  const scopeFilePath = join(ctx.directory, 'scope.json');
  const write = mock();

  await writeFile(
    scopeFilePath,
    JSON.stringify({ format: 'auto-mode.scope', version: 2, paths: ['/srv/notes'] }),
  );

  await makeScopeSourceReader({ kind: 'launcher' })(
    buildMockScopeSourceContext({ scopeFilePath, stderr: { write } }),
  );

  expect(write).toHaveBeenCalledExactlyOnceWith(
    `auto-mode: scope file ignored: version does not match version 1: ${scopeFilePath}\n`,
  );
});
