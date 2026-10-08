import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDenialState } from './load-denial-state.ts';
import { EMPTY_DENIAL_STATE } from './types.ts';
import { writeDenialState } from './write-denial-state.ts';

async function setupTest(): Promise<{ readonly path: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-denials-'));

  onTestFinished(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  return { path: join(dir, 'denials', 'session.json') };
}

test('it reads back the counts it wrote', async () => {
  const ctx = await setupTest();

  const state = {
    consecutive: 2,
    session: 5,
    lastDenied: { retryKey: 'action-a', rule: 'Rule', reason: 'Base reason.' },
  };

  await writeDenialState(ctx.path, state);

  const loaded = await loadDenialState(ctx.path);

  expect(loaded).toStrictEqual(state);
});

test('it starts from zero when the session has no file', async () => {
  const ctx = await setupTest();
  const loaded = await loadDenialState(ctx.path);

  expect(loaded).toStrictEqual(EMPTY_DENIAL_STATE);
});

test('it starts from zero when the file is malformed', async () => {
  const ctx = await setupTest();

  await writeDenialState(ctx.path, EMPTY_DENIAL_STATE);
  await writeFile(ctx.path, '{"consecutive": -1}');

  const loaded = await loadDenialState(ctx.path);

  expect(loaded).toStrictEqual(EMPTY_DENIAL_STATE);
});
