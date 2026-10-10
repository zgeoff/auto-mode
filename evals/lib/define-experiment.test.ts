import { expect, test } from 'bun:test';
import { defineExperiment } from './define-experiment.ts';

test('it returns the experiment it is given', () => {
  const experiment = {
    name: 'local-check',
    description: 'A deterministic stage.',
    corpus: 'containment',
    inputs: [],
    samples: 1,
    loadCases: () => Promise.resolve(new Map<string, string>()),
    stages: [],
    measurements: [],
  };

  expect(defineExperiment(experiment)).toBe(experiment);
});
