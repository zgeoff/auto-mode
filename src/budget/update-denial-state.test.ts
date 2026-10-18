import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDenialState } from './load-denial-state.ts';
import { updateDenialState } from './update-denial-state.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'auto-mode-denials-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { path: join(directory, 'denials', 'session.json') };
}

test('it keeps both counts when two updates of one session run at once', async () => {
  const ctx = await setupTest();

  await Promise.all([
    updateDenialState(ctx.path, (state) => ({
      consecutive: state.consecutive + 1,
      session: state.session + 1,
      lastDenied: { retryKey: 'action-a', rule: 'Rule A', reason: 'Reason A.' },
    })),
    updateDenialState(ctx.path, (state) => ({
      consecutive: state.consecutive + 1,
      session: state.session + 1,
      lastDenied: { retryKey: 'action-b', rule: 'Rule B', reason: 'Reason B.' },
    })),
  ]);

  const state = await loadDenialState(ctx.path);

  expect(state.session).toBe(2);
  expect(state.consecutive).toBe(2);
});
