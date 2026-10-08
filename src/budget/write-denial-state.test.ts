import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMockDenialState } from '../../test-utils/factories/build-mock-denial-state.ts';
import { writeDenialState } from './write-denial-state.ts';

async function setupTest(): Promise<{ readonly dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-denials-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it writes the counts as one JSON line, creating the directory', async () => {
  const ctx = await setupTest();

  await writeDenialState(
    join(ctx.dir, 'denials', 'session.json'),
    buildMockDenialState({
      consecutive: 2,
      session: 5,
      lastDenied: { retryKey: 'action-a', rule: 'Rule', reason: 'Base reason.' },
    }),
  );

  const text = await readFile(join(ctx.dir, 'denials', 'session.json'), 'utf8');

  expect(text).toBe(
    '{"consecutive":2,"session":5,"lastDenied":{"retryKey":"action-a","rule":"Rule","reason":"Base reason."}}\n',
  );
});

test('it creates the session file readable by its owner only', async () => {
  const ctx = await setupTest();

  await writeDenialState(join(ctx.dir, 'denials', 'session.json'), buildMockDenialState());

  const info = await stat(join(ctx.dir, 'denials', 'session.json'));

  expect(info.mode & 0o777).toBe(0o600);
});

test('it creates the denials directory open to its owner only', async () => {
  const ctx = await setupTest();

  await writeDenialState(join(ctx.dir, 'denials', 'session.json'), buildMockDenialState());

  const info = await stat(join(ctx.dir, 'denials'));

  expect(info.mode & 0o777).toBe(0o700);
});

test('it replaces an earlier session file and leaves no staged file behind', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'denials'));
  await writeFile(join(ctx.dir, 'denials', 'session.json'), '{"consecutive":1}\n');

  await writeDenialState(
    join(ctx.dir, 'denials', 'session.json'),
    buildMockDenialState({ consecutive: 0, session: 3, lastDenied: null }),
  );

  const entries = await readdir(join(ctx.dir, 'denials'));

  expect(entries).toStrictEqual(['session.json']);
});

test('it overwrites an earlier session file with the new counts', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'denials'));
  await writeFile(join(ctx.dir, 'denials', 'session.json'), '{"consecutive":1}\n');

  await writeDenialState(
    join(ctx.dir, 'denials', 'session.json'),
    buildMockDenialState({ consecutive: 0, session: 3, lastDenied: null }),
  );

  const text = await readFile(join(ctx.dir, 'denials', 'session.json'), 'utf8');

  expect(text).toBe('{"consecutive":0,"session":3,"lastDenied":null}\n');
});
