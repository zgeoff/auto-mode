import { expect, onTestFinished, test } from 'bun:test';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGit } from '../../test-utils/run-git.ts';
import { tryWriteRequestCapture } from './try-write-request-capture.ts';

async function setupTest(): Promise<{ readonly dir: string }> {
  const created = await mkdtemp(join(tmpdir(), 'auto-mode-capture-'));

  onTestFinished(() => rm(created, { recursive: true, force: true }));

  return { dir: await realpath(created) };
}

test('it appends the record to the file for its day, readable by the owner alone', async () => {
  const ctx = await setupTest();

  const record = {
    schemaVersion: 1,
    time: '2026-10-10T12:00:00.000Z',
    request: { toolName: 'Bash', toolInput: { command: 'make' } },
    verdict: { kind: 'allow' },
    decidingStage: 'jev',
    escalation: false,
  } as const;

  const outcome = await tryWriteRequestCapture(join(ctx.dir, 'captures'), record);

  const path = join(ctx.dir, 'captures', 'requests-2026-10-10.jsonl');

  const content = await readFile(path, 'utf8');
  const fileInfo = await stat(path);
  const dirInfo = await stat(join(ctx.dir, 'captures'));

  expect(outcome).toStrictEqual({ kind: 'written', path });
  expect(JSON.parse(content)).toStrictEqual(record);
  expect(fileInfo.mode & 0o777).toBe(0o600);
  expect(dirInfo.mode & 0o777).toBe(0o700);
});

test('it refuses a dir inside a git work tree and writes nothing', async () => {
  const ctx = await setupTest();

  runGit(ctx.dir, ['init', '-q', '-b', 'main', join(ctx.dir, 'repo')]);

  const outcome = await tryWriteRequestCapture(join(ctx.dir, 'repo', 'captures'), {
    schemaVersion: 1,
    time: '2026-10-10T12:00:00.000Z',
    request: {},
    verdict: null,
    decidingStage: 'budget',
    escalation: true,
  });

  const entries = await readdir(join(ctx.dir, 'repo'));

  expect(outcome).toStrictEqual({
    kind: 'refused',
    reason: `the capture dir is inside the git work tree ${join(ctx.dir, 'repo')}`,
  });

  expect(entries).toStrictEqual(['.git']);
});

test('it refuses a relative dir', async () => {
  const outcome = await tryWriteRequestCapture('captures', {
    schemaVersion: 1,
    time: '2026-10-10T12:00:00.000Z',
    request: {},
    verdict: null,
    decidingStage: 'jev',
    escalation: false,
  });

  expect(outcome).toStrictEqual({
    kind: 'refused',
    reason: 'the capture dir captures is not an absolute path',
  });
});

test('it reports a failure instead of throwing when the dir cannot be created', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'blocker'), '');

  const outcome = await tryWriteRequestCapture(join(ctx.dir, 'blocker', 'captures'), {
    schemaVersion: 1,
    time: '2026-10-10T12:00:00.000Z',
    request: {},
    verdict: null,
    decidingStage: 'jev',
    escalation: false,
  });

  expect(outcome).toStrictEqual({ kind: 'failed' });
});

test('it reports a failure and leaves the target untouched when the capture file is a link', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'captures'), { mode: 0o700 });
  await writeFile(join(ctx.dir, 'target.txt'), 'untouched\n');

  await symlink(
    join(ctx.dir, 'target.txt'),
    join(ctx.dir, 'captures', 'requests-2026-10-10.jsonl'),
  );

  const outcome = await tryWriteRequestCapture(join(ctx.dir, 'captures'), {
    schemaVersion: 1,
    time: '2026-10-10T12:00:00.000Z',
    request: {},
    verdict: null,
    decidingStage: 'jev',
    escalation: false,
  });

  const target = await readFile(join(ctx.dir, 'target.txt'), 'utf8');

  expect(outcome).toStrictEqual({ kind: 'failed' });
  expect(target).toBe('untouched\n');
});

test('it narrows an existing capture dir and file that others can read to the owner alone', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'captures'));
  await chmod(join(ctx.dir, 'captures'), 0o755);
  await writeFile(join(ctx.dir, 'captures', 'requests-2026-10-10.jsonl'), '');
  await chmod(join(ctx.dir, 'captures', 'requests-2026-10-10.jsonl'), 0o644);

  await tryWriteRequestCapture(join(ctx.dir, 'captures'), {
    schemaVersion: 1,
    time: '2026-10-10T12:00:00.000Z',
    request: {},
    verdict: null,
    decidingStage: 'jev',
    escalation: false,
  });

  const dirInfo = await stat(join(ctx.dir, 'captures'));
  const fileInfo = await stat(join(ctx.dir, 'captures', 'requests-2026-10-10.jsonl'));

  expect(dirInfo.mode & 0o777).toBe(0o700);
  expect(fileInfo.mode & 0o777).toBe(0o600);
});

test('it keeps the capture out of a bare repository whose work tree holds the dir', async () => {
  const ctx = await setupTest();

  runGit(ctx.dir, ['init', '-q', '--bare', join(ctx.dir, 'dotfiles.git')]);

  await tryWriteRequestCapture(join(ctx.dir, '.local', 'state', 'captures'), {
    schemaVersion: 1,
    time: '2026-10-10T12:00:00.000Z',
    request: {},
    verdict: null,
    decidingStage: 'jev',
    escalation: false,
  });

  const status = runGit(ctx.dir, [
    '--git-dir',
    join(ctx.dir, 'dotfiles.git'),
    '--work-tree',
    ctx.dir,
    'status',
    '--porcelain',
    '--untracked-files=all',
    '--',
    '.local',
  ]);

  const ignore = await readFile(join(ctx.dir, '.local', 'state', 'captures', '.gitignore'), 'utf8');

  expect(status).toBe('');
  expect(ignore).toBe('*\n');
});
