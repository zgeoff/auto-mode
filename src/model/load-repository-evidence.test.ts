import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMockTaskScopeSummary } from '../../test-utils/factories/build-mock-task-scope-summary.ts';
import { loadRepositoryEvidence } from './load-repository-evidence.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'repository-evidence-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it keeps the task scope when the cwd is not a checkout', async () => {
  const ctx = await setupTest();

  const taskScope = buildMockTaskScopeSummary({ worktrees: ['/repo'], branches: ['feature'] });

  const evidence = await loadRepositoryEvidence(ctx.dir, taskScope, {});

  expect(evidence).toStrictEqual({ cwd: ctx.dir, branch: null, defaultBranch: null, taskScope });
});

test('it adds the task scope to the checkout evidence', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, '.git'));
  await writeFile(join(ctx.dir, '.git', 'HEAD'), 'ref: refs/heads/feature\n');

  const taskScope = buildMockTaskScopeSummary({ branches: ['feature'] });

  const evidence = await loadRepositoryEvidence(ctx.dir, taskScope, {});

  expect(evidence).toStrictEqual({
    cwd: ctx.dir,
    branch: 'feature',
    defaultBranch: null,
    remotes: [],
    taskScope,
  });
});

test('it returns no evidence outside a checkout when there is no task scope', async () => {
  const ctx = await setupTest();
  const evidence = await loadRepositoryEvidence(ctx.dir, undefined, {});

  expect(evidence).toBeNull();
});
