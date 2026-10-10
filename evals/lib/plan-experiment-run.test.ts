import { expect, test } from 'bun:test';
import { buildStageRunKey, planExperimentRun } from './plan-experiment-run.ts';

test('it plans every case, sample and stage and counts requests for the stages that send', () => {
  const plan = planExperimentRun({
    caseKeys: ['a', 'b'],
    samples: 3,
    stages: [
      { name: 'containment', sends: false },
      { name: 'jev', sends: true },
    ],
    seed: 1,
    recorded: [],
  });

  expect(plan).toMatchObject({
    cases: 2,
    samples: 3,
    stages: 2,
    stageRuns: 12,
    requests: 6,
    recorded: 0,
  });

  expect(plan.units.map((unit) => [unit.caseKey, unit.sample])).toIncludeSameMembers([
    ['a', 0],
    ['a', 1],
    ['a', 2],
    ['b', 0],
    ['b', 1],
    ['b', 2],
  ]);
});

test('it skips the stage runs a resumed run already recorded', () => {
  const plan = planExperimentRun({
    caseKeys: ['a', 'b'],
    samples: 1,
    stages: [
      { name: 'containment', sends: false },
      { name: 'jev', sends: true },
    ],
    seed: 1,
    recorded: [
      buildStageRunKey('a', 0, 'containment'),
      buildStageRunKey('a', 0, 'jev'),
      buildStageRunKey('b', 0, 'containment'),
    ],
  });

  expect(plan).toStrictEqual({
    cases: 2,
    samples: 1,
    stages: 2,
    stageRuns: 1,
    requests: 1,
    recorded: 3,
    units: [{ caseKey: 'b', sample: 0, stages: [{ name: 'jev', sends: true }] }],
  });
});

test('it orders the units the same way for the same seed', () => {
  const input = {
    caseKeys: ['a', 'b', 'c', 'd', 'e'],
    samples: 2,
    stages: [{ name: 'jev', sends: true }],
    seed: 7,
    recorded: [],
  };

  expect(planExperimentRun(input)).toStrictEqual(planExperimentRun(input));
});

test('it orders the units differently for another seed', () => {
  const seven = planExperimentRun({
    caseKeys: ['a', 'b', 'c', 'd', 'e'],
    samples: 2,
    stages: [{ name: 'jev', sends: true }],
    seed: 7,
    recorded: [],
  });

  const eight = planExperimentRun({
    caseKeys: ['a', 'b', 'c', 'd', 'e'],
    samples: 2,
    stages: [{ name: 'jev', sends: true }],
    seed: 8,
    recorded: [],
  });

  expect(seven.units).not.toStrictEqual(eight.units);
});
