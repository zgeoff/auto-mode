import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadScopeFile } from './load-scope-file.ts';

async function setupTest(): Promise<{ readonly directory: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'scope-file-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it reads every field of a version 1 scope file', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'scope.json');

  await writeFile(
    path,
    JSON.stringify({
      format: 'auto-mode.scope',
      version: 1,
      paths: ['/srv/notes/'],
      workspace: { path: '/repo/.worktrees/feat', branch: 'feat' },
      worktrees: [{ path: '/repo/.worktrees/extra', branch: null }],
      branches: [{ name: 'later', repo: '/repo' }, { name: 'plain' }],
      pullRequests: [{ repo: 'dev/app', number: 12, url: 'https://x/12', branch: 'feat' }],
      replyChannels: [{ tool: 'SendMessage', field: 'to', recipient: 'lead' }],
    }),
  );

  const loaded = await loadScopeFile(path);

  expect(loaded).toStrictEqual({
    kind: 'scope',
    scope: {
      format: 'auto-mode.scope',
      version: 1,
      paths: ['/srv/notes'],
      workspace: { path: '/repo/.worktrees/feat', branch: 'feat' },
      worktrees: [{ path: '/repo/.worktrees/extra', branch: null }],
      branches: [{ name: 'later', repo: '/repo' }, { name: 'plain' }],
      pullRequests: [{ repo: 'dev/app', number: 12, url: 'https://x/12', branch: 'feat' }],
      replyChannels: [{ tool: 'SendMessage', field: 'to', recipient: 'lead' }],
    },
  });
});

test('it reads a scope file that holds only its format and version as an empty scope', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'scope.json');

  await writeFile(path, JSON.stringify({ format: 'auto-mode.scope', version: 1 }));

  const loaded = await loadScopeFile(path);

  expect(loaded).toStrictEqual({
    kind: 'scope',
    scope: {
      format: 'auto-mode.scope',
      version: 1,
      paths: [],
      worktrees: [],
      branches: [],
      pullRequests: [],
      replyChannels: [],
    },
  });
});

test.each([
  ['no', undefined],
  ['an empty', ''],
])('it reports no scope file when the session names %s path', async (_label, location) => {
  const loaded = await loadScopeFile(location);

  expect(loaded).toStrictEqual({ kind: 'absent' });
});

test('it reports no scope file when the file is missing', async () => {
  const ctx = await setupTest();
  const loaded = await loadScopeFile(join(ctx.directory, 'scope.json'));

  expect(loaded).toStrictEqual({ kind: 'absent' });
});

test('it gives a diagnostic for a scope file path that is not absolute', async () => {
  const loaded = await loadScopeFile('scope.json');

  expect(loaded).toStrictEqual({
    kind: 'malformed',
    diagnostic: 'scope file path is not absolute: scope.json',
  });
});

test('it gives a diagnostic for a scope file path it cannot read', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'scope.json');

  await mkdir(path);

  const loaded = await loadScopeFile(path);

  expect(loaded).toStrictEqual({ kind: 'malformed', diagnostic: `scope file unreadable: ${path}` });
});

test('it gives a diagnostic for a scope file that is not JSON', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'scope.json');

  await writeFile(path, '{ not json');

  const loaded = await loadScopeFile(path);

  expect(loaded).toStrictEqual({
    kind: 'malformed',
    diagnostic: `scope file is not JSON: ${path}`,
  });
});

test('it gives a diagnostic naming the field for a scope file of another version', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'scope.json');

  await writeFile(path, JSON.stringify({ format: 'auto-mode.scope', version: 2 }));

  const loaded = await loadScopeFile(path);

  expect(loaded).toStrictEqual({
    kind: 'malformed',
    diagnostic: `scope file ignored: version does not match version 1: ${path}`,
  });
});

test('it gives a diagnostic naming a key the format does not define', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'scope.json');

  await writeFile(
    path,
    JSON.stringify({
      format: 'auto-mode.scope',
      version: 1,
      replyChannel: [{ tool: 'SendMessage', field: 'to', recipient: 'lead' }],
    }),
  );

  const loaded = await loadScopeFile(path);

  expect(loaded).toStrictEqual({
    kind: 'malformed',
    diagnostic: `scope file ignored: replyChannel does not match version 1: ${path}`,
  });
});

test('it gives a diagnostic naming a key the format does not define inside an entry', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'scope.json');

  await writeFile(
    path,
    JSON.stringify({
      format: 'auto-mode.scope',
      version: 1,
      replyChannels: [{ tool: 'SendMessage', field: 'to', recipient: 'lead', urgent: true }],
    }),
  );

  const loaded = await loadScopeFile(path);

  expect(loaded).toStrictEqual({
    kind: 'malformed',
    diagnostic: `scope file ignored: replyChannels.0.urgent does not match version 1: ${path}`,
  });
});

test('it gives a diagnostic naming only the file when the file is not a JSON object', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'scope.json');

  await writeFile(path, JSON.stringify(['/srv/notes']));

  const loaded = await loadScopeFile(path);

  expect(loaded).toStrictEqual({
    kind: 'malformed',
    diagnostic: `scope file ignored: file does not match version 1: ${path}`,
  });
});

test('it gives a diagnostic for an owned path that is not absolute', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'scope.json');

  await writeFile(
    path,
    JSON.stringify({ format: 'auto-mode.scope', version: 1, paths: ['/srv/notes', 'notes'] }),
  );

  const loaded = await loadScopeFile(path);

  expect(loaded).toStrictEqual({
    kind: 'malformed',
    diagnostic: `scope file ignored: paths.1 does not match version 1: ${path}`,
  });
});

test('it gives a diagnostic for a reply channel with no recipient', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'scope.json');

  await writeFile(
    path,
    JSON.stringify({
      format: 'auto-mode.scope',
      version: 1,
      replyChannels: [{ tool: 'SendMessage', field: 'to' }],
    }),
  );

  const loaded = await loadScopeFile(path);

  expect(loaded).toStrictEqual({
    kind: 'malformed',
    diagnostic: `scope file ignored: replyChannels.0.recipient does not match version 1: ${path}`,
  });
});

test('it gives a diagnostic for a branch with no repo when the file declares no workspace', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'scope.json');

  await writeFile(
    path,
    JSON.stringify({
      format: 'auto-mode.scope',
      version: 1,
      branches: [{ name: 'later', repo: '/repo' }, { name: 'plain' }],
    }),
  );

  const loaded = await loadScopeFile(path);

  expect(loaded).toStrictEqual({
    kind: 'malformed',
    diagnostic: `scope file ignored: branches.1.repo does not match version 1: ${path}`,
  });
});
