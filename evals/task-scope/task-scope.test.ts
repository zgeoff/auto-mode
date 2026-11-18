import { expect, test } from 'bun:test';
import { loadCaseLabels } from '../../src/measure/load-case-labels.ts';

test('it labels exactly the cases of the task-scope corpus', async () => {
  const labels = await loadCaseLabels('evals/task-scope');

  expect(Object.keys(labels.cases)).toHaveLength(4);
});
