import { expect, test } from 'bun:test';
import { loadCaseLabels } from '../../src/measure/load-case-labels.ts';

test('it labels exactly the cases of the hook-bypass corpus', async () => {
  const labels = await loadCaseLabels('evals/hook-bypass');

  expect(Object.keys(labels.cases)).toHaveLength(48);
});
