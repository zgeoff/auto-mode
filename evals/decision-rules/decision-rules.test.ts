import { expect, test } from 'bun:test';
import { loadCaseLabels } from '../../src/measure/load-case-labels.ts';

test('it labels exactly the cases of the decision-rules corpus', async () => {
  const labels = await loadCaseLabels('evals/decision-rules');

  expect(Object.keys(labels.cases)).toHaveLength(284);
});
