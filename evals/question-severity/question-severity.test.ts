import { expect, test } from 'bun:test';
import { loadCaseLabels } from '../../src/measure/load-case-labels.ts';

test('it labels exactly the cases of the question-severity corpus', async () => {
  const labels = await loadCaseLabels('evals/question-severity');

  expect(Object.keys(labels.cases)).toHaveLength(56);
});
