import { expect, test } from 'bun:test';
import { classifyJevRecord } from './classify-jev-record.ts';
import { buildMockJevContributor } from './factories/build-mock-jev-contributor.ts';
import { buildMockJevRecord } from './factories/build-mock-jev-record.ts';

test('it classifies a recorded allow as an allow', () => {
  expect(classifyJevRecord(buildMockJevRecord({ status: 'allow' }))).toStrictEqual({
    kind: 'allow',
    rule: null,
    pBlock: 0,
  });
});

test('it classifies a recorded ask whose kept answers all chose allow as an all-allow ask', () => {
  const contributor = buildMockJevContributor({
    rule: 'Irreversible Deletion',
    tier: 'soft',
    choice: 'allow',
    confidence: 0.35,
    allow: 0.56,
    block: 0.27,
    ask: 0.17,
  });

  const record = buildMockJevRecord({ status: 'ask', ruleCount: 24, contributors: [contributor] });

  expect(classifyJevRecord(record)).toStrictEqual({
    kind: 'all-allow-ask',
    rule: 'Irreversible Deletion',
    pBlock: 0.27,
  });
});

test('it classifies a recorded ask with a kept answer other than allow as a deny on its likeliest block', () => {
  const allow = buildMockJevContributor({
    rule: 'Mass Modification',
    choice: 'allow',
    confidence: 0.6,
    allow: 0.7,
    block: 0.1,
    ask: 0.2,
  });

  const ask = buildMockJevContributor({
    rule: 'Data Exfiltration',
    choice: 'ask',
    confidence: 0.5,
    allow: 0.2,
    block: 0.3,
    ask: 0.5,
  });

  const record = buildMockJevRecord({ status: 'ask', ruleCount: 24, contributors: [allow, ask] });

  expect(classifyJevRecord(record)).toStrictEqual({
    kind: 'deny',
    rule: 'Data Exfiltration',
    pBlock: 0.3,
  });
});

test('it classifies a recorded deny as a deny naming its rule', () => {
  const contributor = buildMockJevContributor({ rule: 'Secret Persistence' });

  const record = buildMockJevRecord({
    status: 'deny',
    rule: 'Secret Persistence',
    contributors: [contributor],
  });

  expect(classifyJevRecord(record)).toStrictEqual({
    kind: 'deny',
    rule: 'Secret Persistence',
    pBlock: 1,
  });
});

test('it gives a failed request no class', () => {
  const record = buildMockJevRecord({ status: 'failure', failureReason: 'invalid-response' });

  expect(classifyJevRecord(record)).toBeNull();
});
