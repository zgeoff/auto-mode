import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStubOutput } from '../../test-utils/build-stub-output.ts';
import { buildMockDenialBudget } from '../../test-utils/factories/build-mock-denial-budget.ts';
import { buildMockVerdict } from '../../test-utils/factories/build-mock-verdict.ts';
import { loadDenialState } from './load-denial-state.ts';
import { planDenialBudget } from './plan-denial-budget.ts';
import { tryUpdateDenialBudget } from './try-update-denial-budget.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-try-denials-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir, stderr: buildStubOutput() };
}

test('it writes nothing for a plan that changes no count', async () => {
  const ctx = await setupTest();

  const path = join(ctx.dir, 'denials', 'session.json');

  const plan = await tryUpdateDenialBudget(ctx.stderr, path, (state) =>
    planDenialBudget(
      state,
      null,
      'action-a',
      buildMockDenialBudget({ consecutive: 3, perSession: 20 }),
    ),
  );

  const written = await stat(path).then(
    () => true,
    () => false,
  );

  expect(plan.verdict).toBeNull();
  expect(written).toBe(false);
});

test('it writes the counts a deny adds', async () => {
  const ctx = await setupTest();

  const path = join(ctx.dir, 'denials', 'session.json');

  await tryUpdateDenialBudget(ctx.stderr, path, (state) =>
    planDenialBudget(
      state,
      buildMockVerdict({ kind: 'deny', rule: 'Rule', reason: 'Base reason.' }),
      'action-a',
      buildMockDenialBudget({ consecutive: 3, perSession: 20 }),
    ),
  );

  const written = await loadDenialState(path);

  expect(written).toStrictEqual({
    consecutive: 1,
    session: 1,
    lastDenied: { retryKey: 'action-a', rule: 'Rule', reason: 'Base reason.' },
  });
});

test('it keeps the deny and reports the counts unavailable when they cannot be written', async () => {
  const ctx = await setupTest();

  const blocker = join(ctx.dir, 'not-a-directory');

  await writeFile(blocker, '');

  const plan = await tryUpdateDenialBudget(ctx.stderr, join(blocker, 'session.json'), (state) =>
    planDenialBudget(
      state,
      buildMockVerdict({ kind: 'deny', rule: 'Rule', reason: 'Base reason.' }),
      'action-a',
      buildMockDenialBudget({ consecutive: 3, perSession: 20 }),
    ),
  );

  expect(plan.verdict).toStrictEqual({
    kind: 'deny',
    rule: 'Rule',
    reason: 'Base reason. Denials left before auto-mode asks the user: 2.',
  });

  expect(ctx.stderr.read()).toBe('auto-mode: denial counts unavailable\n');
});
