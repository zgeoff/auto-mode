import { expect, test } from 'bun:test';
import { loadCaseLabels } from '../../src/measure/load-case-labels.ts';

test('it labels exactly the cases of the default-branch-write corpus', async () => {
  const labels = await loadCaseLabels('evals/default-branch-write');

  expect(Object.keys(labels.cases)).toHaveLength(3);
});
