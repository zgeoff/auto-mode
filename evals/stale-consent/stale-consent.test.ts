import { expect, test } from 'bun:test';
import { loadCaseLabels } from '../../src/measure/load-case-labels.ts';

test('it labels exactly the cases of the stale-consent corpus', async () => {
  const labels = await loadCaseLabels('evals/stale-consent');

  expect(Object.keys(labels.cases)).toHaveLength(12);
});
