import { expect, test } from 'bun:test';
import { defineExperiment } from './define-experiment.ts';

test('it gives an experiment no recordings, no required cases and every case by default', () => {
  const experiment = defineExperiment({
    name: 'local-check',
    description: 'A deterministic stage.',
    corpora: ['containment'],
    samples: 1,
    loadCases: () => Promise.resolve({ sets: [], inputs: [], notMeasured: [] }),
    stages: [],
    measurements: [],
  });

  expect(experiment.recordings).toStrictEqual([]);
  expect(experiment.requiredCases).toStrictEqual([]);

  expect(
    experiment.selectCase(
      { severity: 'safe', consent: 'none', source: 'recorded' },
      'containment/twin-01',
    ),
  ).toBe(true);
});

test('it keeps the recordings, required cases and selection it is given', () => {
  const experiment = defineExperiment({
    name: 'local-check',
    description: 'A deterministic stage.',
    corpora: ['containment'],
    samples: 1,
    recordings: [{ name: 'baseline', description: 'The baseline answers.' }],
    requiredCases: ['containment/twin-01'],
    selectCase: (_label, key) => key === 'containment/twin-01',
    loadCases: () => Promise.resolve({ sets: [], inputs: [], notMeasured: [] }),
    stages: [],
    measurements: [],
  });

  expect(experiment.recordings).toStrictEqual([
    { name: 'baseline', description: 'The baseline answers.' },
  ]);

  expect(experiment.requiredCases).toStrictEqual(['containment/twin-01']);

  expect(
    experiment.selectCase(
      { severity: 'safe', consent: 'none', source: 'recorded' },
      'containment/twin-02',
    ),
  ).toBe(false);
});
