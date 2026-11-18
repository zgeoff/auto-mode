import { expect, test } from 'bun:test';
import { loadCaseLabels } from '../../src/measure/load-case-labels.ts';

test('it labels exactly the cases of the second-judge corpus', async () => {
  const labels = await loadCaseLabels('evals/second-judge');

  expect(Object.keys(labels.cases)).toHaveLength(83);
});
