import { expect, test } from 'bun:test';
import { loadCaseLabels } from '../../src/measure/load-case-labels.ts';

test('it labels exactly the cases of the relay-consent corpus', async () => {
  const labels = await loadCaseLabels('evals/relay-consent');

  expect(Object.keys(labels.cases)).toHaveLength(76);
});
