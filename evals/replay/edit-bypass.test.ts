import { expect, test } from 'bun:test';
import { classifyEdit } from '../../src/bypass/classify-edit.ts';
import { buildStubEditAction } from '../test-utils/build-stub-edit-action.ts';
import { countValues } from '../test-utils/count-values.ts';
import { loadDecisionRulesCases } from '../test-utils/load-decision-rules-cases.ts';

test('it lets 83 of the 232 real actions skip Jev in the cwd scope of their session', async () => {
  const cases = await loadDecisionRulesCases('fixtures/decision-rules/real-traffic.json');

  const outcomes = cases.map((entry) =>
    classifyEdit(buildStubEditAction(entry), { worktrees: [entry.cwd], protectedDirs: [] }),
  );

  expect(outcomes).toHaveLength(232);
  expect(outcomes.filter((outcome) => outcome.kind === 'bypass')).toHaveLength(83);
});

test('it sends the other real actions, 3 secret-shaped edits among them, to Jev', async () => {
  const cases = await loadDecisionRulesCases('fixtures/decision-rules/real-traffic.json');

  const outcomes = cases.map((entry) =>
    classifyEdit(buildStubEditAction(entry), { worktrees: [entry.cwd], protectedDirs: [] }),
  );

  expect(
    countValues(
      outcomes.filter((outcome) => outcome.kind === 'jev').map((outcome) => outcome.reason),
    ),
  ).toStrictEqual({
    'not a file-tool edit': 136,
    'secret scan matched generic-credential-uri': 2,
    'secret scan matched generic-password': 1,
    'target in a nested worktree outside the scope': 2,
    'target outside every in-scope worktree': 8,
  });
});
