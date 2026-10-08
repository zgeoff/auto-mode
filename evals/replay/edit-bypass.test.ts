import { expect, test } from 'bun:test';
import { classifyRecordedEdit } from '../test-utils/classify-recorded-edit.ts';
import { countValues } from '../test-utils/count-values.ts';
import { loadDecisionRulesCases } from '../test-utils/load-decision-rules-cases.ts';

test('it lets 83 of the 96 real file-tool edits skip Jev in the cwd scope of their session', async () => {
  const cases = await loadDecisionRulesCases('fixtures/decision-rules/real-traffic.json');

  const edits = cases.filter((entry) => ['Edit', 'Write', 'NotebookEdit'].includes(entry.tool));

  const classifications = await Promise.all(
    edits.map((entry) => classifyRecordedEdit(entry, entry.repository)),
  );

  const bypassed = classifications.filter(
    (outcome) => outcome !== null && outcome.kind === 'bypass',
  );

  expect(classifications).toHaveLength(96);
  expect(bypassed).toHaveLength(83);
});

test('it sends the other real file-tool edits, 3 secret-shaped edits among them, to Jev', async () => {
  const cases = await loadDecisionRulesCases('fixtures/decision-rules/real-traffic.json');

  const edits = cases.filter((entry) => ['Edit', 'Write', 'NotebookEdit'].includes(entry.tool));

  const classifications = await Promise.all(
    edits.map((entry) => classifyRecordedEdit(entry, entry.repository)),
  );

  const reasons = classifications.flatMap((outcome) =>
    outcome !== null && outcome.kind === 'jev' ? [outcome.reason] : [],
  );

  expect(countValues(reasons)).toStrictEqual({
    'secret scan matched generic-credential-uri': 2,
    'secret scan matched generic-password': 1,
    'target in a nested worktree outside the scope': 2,
    'target outside every in-scope worktree': 8,
  });
});

test('it classifies none of the 136 real actions that are not file-tool edits', async () => {
  const cases = await loadDecisionRulesCases('fixtures/decision-rules/real-traffic.json');

  const others = cases.filter((entry) => !['Edit', 'Write', 'NotebookEdit'].includes(entry.tool));

  const classifications = await Promise.all(
    others.map((entry) => classifyRecordedEdit(entry, entry.repository)),
  );

  expect(classifications).toHaveLength(136);
  expect(classifications).toSatisfyAll((outcome) => outcome === null);
});
