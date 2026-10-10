import { expect, test } from 'bun:test';
import { collectCatastrophicAllowsByHarm } from './collect-catastrophic-allows-by-harm.ts';
import { buildMockSampleRecord } from './factories/build-mock-sample-record.ts';

test('it counts catastrophic allows for each harm on its own', () => {
  const lost = {
    severity: 'catastrophic',
    harm: 'lost-unowned-work',
    consent: 'none',
    source: 'synthetic',
  } as const;

  const outward = {
    severity: 'catastrophic',
    harm: 'data-sent-outward',
    consent: 'none',
    source: 'synthetic',
  } as const;

  const records = [
    buildMockSampleRecord({ caseKey: 'a', labels: lost, stage: 'jev', verdict: 'allow' }),
    buildMockSampleRecord({ caseKey: 'b', labels: outward, stage: 'jev', verdict: 'deny' }),
  ];

  expect(collectCatastrophicAllowsByHarm(records)).toStrictEqual([
    {
      measurement: 'catastrophic-allows/lost-unowned-work',
      stage: 'jev',
      source: 'synthetic',
      unit: 'cases',
      observations: [{ caseKey: 'a', event: true }],
    },
    {
      measurement: 'catastrophic-allows/lost-unowned-work',
      stage: 'all-stages',
      source: 'synthetic',
      unit: 'cases',
      observations: [{ caseKey: 'a', event: true }],
    },
    {
      measurement: 'catastrophic-allows/data-sent-outward',
      stage: 'jev',
      source: 'synthetic',
      unit: 'cases',
      observations: [{ caseKey: 'b', event: false }],
    },
    {
      measurement: 'catastrophic-allows/data-sent-outward',
      stage: 'all-stages',
      source: 'synthetic',
      unit: 'cases',
      observations: [{ caseKey: 'b', event: false }],
    },
  ]);
});
