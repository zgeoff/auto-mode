import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRepositoryEvidence } from './load-repository-evidence.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'repository-evidence-'));

  onTestFinished(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  return { dir };
}

test('it keeps the task scope when the cwd is not a checkout', async () => {
  const ctx = await setupTest();

  const taskScope = { worktrees: ['/repo'], branches: ['feature'], pullRequests: [] };

  const evidence = await loadRepositoryEvidence(ctx.dir, taskScope);

  expect(evidence).toStrictEqual({ cwd: ctx.dir, branch: null, defaultBranch: null, taskScope });
});

test('it returns no evidence outside a checkout when there is no task scope', async () => {
  const ctx = await setupTest();
  const evidence = await loadRepositoryEvidence(ctx.dir, undefined);

  expect(evidence).toBeNull();
});
