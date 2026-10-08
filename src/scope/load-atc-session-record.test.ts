import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAtcSessionRecord } from './load-atc-session-record.ts';

async function setupTest(): Promise<{ readonly dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'atc-record-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it reads a version 1 record and ignores the keys it does not know', async () => {
  const ctx = await setupTest();

  const path = join(ctx.dir, 'record.json');

  await writeFile(
    path,
    JSON.stringify({
      format: 'atc.session-record',
      version: 1,
      session: 'atc-1',
      daemonID: 'daemon-1',
      target: 'local',
      revision: 2,
      updatedAt: '2026-10-08T00:00:00.000Z',
      identity: { later: true },
      scope: {
        workspace: {
          path: '/repo/.worktrees/feat',
          branch: 'feat',
          repoURL: 'https://x',
          sha: 'abc',
        },
        worktrees: [{ path: '/repo/.worktrees/extra', branch: 'extra' }],
        branches: [{ name: 'later', repo: '/repo' }],
        pullRequests: [{ repo: 'dev/app', number: 12, url: 'https://x/12', branch: 'feat' }],
      },
    }),
  );

  const loaded = await loadAtcSessionRecord(path, 'atc-1');

  expect(loaded).toStrictEqual({
    kind: 'record',
    record: {
      format: 'atc.session-record',
      version: 1,
      session: 'atc-1',
      scope: {
        workspace: { path: '/repo/.worktrees/feat', branch: 'feat' },
        worktrees: [{ path: '/repo/.worktrees/extra', branch: 'extra' }],
        branches: [{ name: 'later', repo: '/repo' }],
        pullRequests: [{ repo: 'dev/app', number: 12, url: 'https://x/12', branch: 'feat' }],
      },
    },
  });
});

test.each([
  ['no', undefined],
  ['an empty', ''],
])('it reports no record when the session names %s record path', async (_label, location) => {
  const loaded = await loadAtcSessionRecord(location, 'atc-1');

  expect(loaded).toStrictEqual({ kind: 'absent' });
});

test('it reports no record when the file is missing', async () => {
  const ctx = await setupTest();
  const loaded = await loadAtcSessionRecord(join(ctx.dir, 'record.json'), 'atc-1');

  expect(loaded).toStrictEqual({ kind: 'absent' });
});

test('it gives a diagnostic for a record path that is not absolute', async () => {
  const loaded = await loadAtcSessionRecord('record.json', 'atc-1');

  expect(loaded).toStrictEqual({
    kind: 'malformed',
    diagnostic: 'atc session record path is not absolute: record.json',
  });
});

test('it gives a diagnostic for a record path it cannot read', async () => {
  const ctx = await setupTest();

  const path = join(ctx.dir, 'record.json');

  await mkdir(path);

  const loaded = await loadAtcSessionRecord(path, 'atc-1');

  expect(loaded).toStrictEqual({
    kind: 'malformed',
    diagnostic: `atc session record unreadable: ${path}`,
  });
});

test('it gives a diagnostic for a record that is not JSON', async () => {
  const ctx = await setupTest();

  const path = join(ctx.dir, 'record.json');

  await writeFile(path, '{"format":');

  const loaded = await loadAtcSessionRecord(path, 'atc-1');

  expect(loaded).toStrictEqual({
    kind: 'malformed',
    diagnostic: `atc session record is not JSON: ${path}`,
  });
});

test('it names the version in the diagnostic for a record of another version', async () => {
  const ctx = await setupTest();

  const path = join(ctx.dir, 'record.json');

  await writeFile(
    path,
    JSON.stringify({
      format: 'atc.session-record',
      version: 2,
      session: 'atc-1',
      scope: {
        workspace: { path: '/repo/.worktrees/feat', branch: 'feat' },
        worktrees: [],
        branches: [],
        pullRequests: [],
      },
    }),
  );

  const loaded = await loadAtcSessionRecord(path, 'atc-1');

  expect(loaded).toStrictEqual({
    kind: 'malformed',
    diagnostic: `atc session record ignored: version does not match version 1: ${path}`,
  });
});

test('it names the nested field in the diagnostic for a record with a relative workspace path', async () => {
  const ctx = await setupTest();

  const path = join(ctx.dir, 'record.json');

  await writeFile(
    path,
    JSON.stringify({
      format: 'atc.session-record',
      version: 1,
      session: 'atc-1',
      scope: {
        workspace: { path: 'repo/.worktrees/feat', branch: 'feat' },
        worktrees: [],
        branches: [],
        pullRequests: [],
      },
    }),
  );

  const loaded = await loadAtcSessionRecord(path, 'atc-1');

  expect(loaded).toStrictEqual({
    kind: 'malformed',
    diagnostic: `atc session record ignored: scope.workspace.path does not match version 1: ${path}`,
  });
});

test('it names the whole record in the diagnostic for JSON that is not an object', async () => {
  const ctx = await setupTest();

  const path = join(ctx.dir, 'record.json');

  await writeFile(path, 'null');

  const loaded = await loadAtcSessionRecord(path, 'atc-1');

  expect(loaded).toStrictEqual({
    kind: 'malformed',
    diagnostic: `atc session record ignored: record does not match version 1: ${path}`,
  });
});

test.each([
  ['no', undefined],
  ['an empty', ''],
])(
  'it gives a diagnostic for a valid record when the caller names %s session',
  async (_label, sessionID) => {
    const ctx = await setupTest();

    const path = join(ctx.dir, 'record.json');

    await writeFile(
      path,
      JSON.stringify({
        format: 'atc.session-record',
        version: 1,
        session: 'atc-1',
        scope: {
          workspace: { path: '/repo/.worktrees/feat', branch: 'feat' },
          worktrees: [],
          branches: [],
          pullRequests: [],
        },
      }),
    );

    const loaded = await loadAtcSessionRecord(path, sessionID);

    expect(loaded).toStrictEqual({
      kind: 'malformed',
      diagnostic: `atc session record has no session to match: ${path}`,
    });
  },
);

test('it gives a diagnostic for a record that belongs to another session', async () => {
  const ctx = await setupTest();

  const path = join(ctx.dir, 'record.json');

  await writeFile(
    path,
    JSON.stringify({
      format: 'atc.session-record',
      version: 1,
      session: 'atc-2',
      scope: {
        workspace: { path: '/repo/.worktrees/feat', branch: 'feat' },
        worktrees: [],
        branches: [],
        pullRequests: [],
      },
    }),
  );

  const loaded = await loadAtcSessionRecord(path, 'atc-1');

  expect(loaded).toStrictEqual({
    kind: 'malformed',
    diagnostic: `atc session record belongs to another session: ${path}`,
  });
});
