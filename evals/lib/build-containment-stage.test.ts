import { expect, test } from 'bun:test';
import { buildMockActionRequest } from '../../test-utils/factories/build-mock-action-request.ts';
import { buildMockRepositoryContext } from '../../test-utils/factories/build-mock-repository-context.ts';
import { buildContainmentStage } from './build-containment-stage.ts';
import { buildMockMeasurementCase } from './factories/build-mock-measurement-case.ts';
import { buildMockStageContext } from './factories/build-mock-stage-context.ts';

test('it allows a write inside the cwd checkout without sending a request', async () => {
  const action = buildMockActionRequest({
    cwd: '/home/dev/app/.worktrees/feat',
    toolName: 'Bash',
    toolInput: { command: 'rm -rf build' },
  });

  const repository = buildMockRepositoryContext({ branch: 'feat/a', defaultBranch: 'main' });

  const entry = {
    key: 'set/a',
    labels: { severity: 'safe', consent: 'none', source: 'synthetic' },
  } as const;

  const outcome = await buildContainmentStage().run(
    { ...entry, case: buildMockMeasurementCase({ action, repository }) },
    buildMockStageContext(),
  );

  expect(outcome).toStrictEqual({ status: 'scored', verdict: 'allow', pBlock: null, reason: null });
});

test('it denies a write outside the task scope with the containment reason', async () => {
  const action = buildMockActionRequest({
    cwd: '/home/dev/app/.worktrees/feat',
    toolName: 'Bash',
    toolInput: { command: 'rm -rf ../other' },
  });

  const repository = buildMockRepositoryContext({ branch: 'feat/a', defaultBranch: 'main' });

  const entry = {
    key: 'set/a',
    labels: { severity: 'safe', consent: 'none', source: 'synthetic' },
  } as const;

  const outcome = await buildContainmentStage().run(
    { ...entry, case: buildMockMeasurementCase({ action, repository }) },
    buildMockStageContext(),
  );

  expect(outcome).toStrictEqual({
    status: 'scored',
    verdict: 'deny',
    pBlock: null,
    reason:
      "This action writes outside the task scope: path /home/dev/app/.worktrees/other. The task owns the worktree /home/dev/app/.worktrees/feat and the branch feat/a. Do the work inside the task's own worktree and branch, or ask the user to extend the task scope to this target.",
  });
});
