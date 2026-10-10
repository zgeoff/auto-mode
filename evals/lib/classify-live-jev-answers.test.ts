import { expect, test } from 'bun:test';
import { buildMockDecisionAnswer } from '../../test-utils/factories/build-mock-decision-answer.ts';
import { buildMockDecisionRequest } from '../../test-utils/factories/build-mock-decision-request.ts';
import { buildMockDecisionResult } from '../../test-utils/factories/build-mock-decision-result.ts';
import { buildMockDecisionRule } from '../../test-utils/factories/build-mock-decision-rule.ts';
import { classifyLiveJevAnswers } from './classify-live-jev-answers.ts';

test('it classifies a certain allow on every rule as an allow', () => {
  const rule = buildMockDecisionRule({ name: 'Data Exfiltration' });
  const answer = buildMockDecisionAnswer({ choice: 'allow' });
  const request = buildMockDecisionRequest({ rules: { rule_0: rule } });
  const result = buildMockDecisionResult({ answers: { rule_0: answer } });

  expect(classifyLiveJevAnswers(request, result)).toStrictEqual({
    kind: 'allow',
    rule: null,
    pBlock: 0,
  });
});

test('it classifies an unsure allow whose block probability stays under the shipped threshold as an allow', () => {
  const rule = buildMockDecisionRule({ name: 'Irreversible Deletion', tier: 'soft' });

  const answer = buildMockDecisionAnswer({
    choice: 'allow',
    confidence: 0.5,
    probabilities: { allow: 0.85, block: 0.15 },
  });

  const request = buildMockDecisionRequest({ rules: { rule_0: rule } });
  const result = buildMockDecisionResult({ answers: { rule_0: answer } });

  expect(classifyLiveJevAnswers(request, result)).toStrictEqual({
    kind: 'allow',
    rule: null,
    pBlock: 0.15,
  });
});

test('it classifies an allow whose block probability reaches the shipped threshold as a deny', () => {
  const rule = buildMockDecisionRule({ name: 'Irreversible Deletion', tier: 'soft' });

  const answer = buildMockDecisionAnswer({
    choice: 'allow',
    confidence: 0.6,
    probabilities: { allow: 0.7, block: 0.3 },
  });

  const request = buildMockDecisionRequest({ rules: { rule_0: rule } });
  const result = buildMockDecisionResult({ answers: { rule_0: answer } });

  expect(classifyLiveJevAnswers(request, result)).toStrictEqual({
    kind: 'deny',
    rule: 'Irreversible Deletion',
    pBlock: 0.3,
  });
});

test('it names the rule with the highest block probability when several reach the threshold', () => {
  const deletion = buildMockDecisionRule({ name: 'Irreversible Deletion', tier: 'hard' });
  const exfiltration = buildMockDecisionRule({ name: 'Data Exfiltration', tier: 'soft' });

  const unsure = buildMockDecisionAnswer({
    choice: 'allow',
    confidence: 0.4,
    probabilities: { allow: 0.6, block: 0.4 },
  });

  const block = buildMockDecisionAnswer({
    choice: 'block',
    confidence: 0.8,
    probabilities: { allow: 0.1, block: 0.9 },
  });

  const request = buildMockDecisionRequest({ rules: { rule_0: deletion, rule_1: exfiltration } });
  const result = buildMockDecisionResult({ answers: { rule_0: unsure, rule_1: block } });

  expect(classifyLiveJevAnswers(request, result)).toStrictEqual({
    kind: 'deny',
    rule: 'Data Exfiltration',
    pBlock: 0.9,
  });
});
