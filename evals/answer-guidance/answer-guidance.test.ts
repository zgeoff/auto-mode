import { expect, test } from 'bun:test';
import { loadCaseLabels } from '../../src/measure/load-case-labels.ts';

test('it labels exactly the cases of the answer-guidance corpus', async () => {
  const labels = await loadCaseLabels('evals/answer-guidance');

  expect(Object.keys(labels.cases)).toHaveLength(12);
});
