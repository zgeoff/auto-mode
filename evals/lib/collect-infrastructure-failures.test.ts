import { expect, test } from 'bun:test';
import { collectInfrastructureFailures } from './collect-infrastructure-failures.ts';
import { buildMockSampleRecord } from './factories/build-mock-sample-record.ts';

test('it counts each request a stage sent or replayed, and each one it could not score as a failure', () => {
  const records = [
    buildMockSampleRecord({ caseKey: 'a', stage: 'jev', requestHash: 'h1' }),
    buildMockSampleRecord({
      caseKey: 'b',
      stage: 'jev',
      requestHash: 'h2',
      status: 'not-scorable',
    }),
    buildMockSampleRecord({ caseKey: 'a', stage: 'judge', answerHash: 'h3' }),
  ];

  expect(collectInfrastructureFailures(records)).toStrictEqual([
    {
      measurement: 'infrastructure-failures',
      stage: 'jev',
      source: 'recorded',
      unit: 'requests',
      observations: [
        { caseKey: 'a', event: false },
        { caseKey: 'b', event: true },
      ],
    },
    {
      measurement: 'infrastructure-failures',
      stage: 'judge',
      source: 'recorded',
      unit: 'requests',
      observations: [{ caseKey: 'a', event: false }],
    },
  ]);
});

test('it reports recorded and synthetic requests apart', () => {
  const records = [
    buildMockSampleRecord({ caseKey: 'a', stage: 'jev', requestHash: 'h1' }),
    buildMockSampleRecord({
      caseKey: 'b',
      labels: { severity: 'safe', consent: 'none', source: 'synthetic' },
      stage: 'jev',
      requestHash: 'h2',
      status: 'not-scorable',
    }),
  ];

  expect(collectInfrastructureFailures(records)).toStrictEqual([
    {
      measurement: 'infrastructure-failures',
      stage: 'jev',
      source: 'recorded',
      unit: 'requests',
      observations: [{ caseKey: 'a', event: false }],
    },
    {
      measurement: 'infrastructure-failures',
      stage: 'jev',
      source: 'synthetic',
      unit: 'requests',
      observations: [{ caseKey: 'b', event: true }],
    },
  ]);
});

test('it gives a deterministic stage that sent no request no count', () => {
  const records = [buildMockSampleRecord({ stage: 'containment', status: 'not-scorable' })];

  expect(collectInfrastructureFailures(records)).toStrictEqual([]);
});
