import { expect, test } from 'bun:test';
import { buildMockDecisionAnswer } from '../../test-utils/factories/build-mock-decision-answer.ts';
import { buildMockDecisionRequest } from '../../test-utils/factories/build-mock-decision-request.ts';
import { buildMockDecisionResult } from '../../test-utils/factories/build-mock-decision-result.ts';
import { buildMockDecisionRule } from '../../test-utils/factories/build-mock-decision-rule.ts';
import { classifyJevAnswers } from './classify-jev-answers.ts';

test('it classifies a confident allow on every rule as an allow', () => {
  const rule = buildMockDecisionRule({ name: 'Data Exfiltration' });
  const answer = buildMockDecisionAnswer({ choice: 'allow' });
  const request = buildMockDecisionRequest({ rules: { rule_0: rule } });
  const result = buildMockDecisionResult({ answers: { rule_0: answer } });

  expect(classifyJevAnswers(request, result)).toStrictEqual({
    kind: 'allow',
    rule: null,
    pBlock: 0,
  });
});

test('it classifies an uncertain answer set whose every choice is allow as an all-allow ask', () => {
  const rule = buildMockDecisionRule({ name: 'Irreversible Deletion', tier: 'soft' });

  const answer = buildMockDecisionAnswer({
    choice: 'allow',
    confidence: 0.5,
    probabilities: { allow: 0.6, block: 0.3, ask: 0.1 },
  });

  const request = buildMockDecisionRequest({ rules: { rule_0: rule } });
  const result = buildMockDecisionResult({ answers: { rule_0: answer } });

  expect(classifyJevAnswers(request, result)).toStrictEqual({
    kind: 'all-allow-ask',
    rule: 'Irreversible Deletion',
    pBlock: 0.3,
  });
});

test('it classifies an uncertain answer set with a choice other than allow as a deny', () => {
  const deletion = buildMockDecisionRule({ name: 'Irreversible Deletion', tier: 'soft' });
  const exfiltration = buildMockDecisionRule({ name: 'Data Exfiltration', tier: 'soft' });
  const allow = buildMockDecisionAnswer({ choice: 'allow' });

  const ask = buildMockDecisionAnswer({
    choice: 'ask',
    confidence: 0.5,
    probabilities: { allow: 0.2, block: 0.3, ask: 0.5 },
  });

  const request = buildMockDecisionRequest({ rules: { rule_0: deletion, rule_1: exfiltration } });
  const result = buildMockDecisionResult({ answers: { rule_0: allow, rule_1: ask } });

  expect(classifyJevAnswers(request, result)).toStrictEqual({
    kind: 'deny',
    rule: 'Data Exfiltration',
    pBlock: 0.3,
  });
});

test('it classifies a confident block as a deny naming the blocking rule', () => {
  const rule = buildMockDecisionRule({ name: 'Secret Persistence' });
  const answer = buildMockDecisionAnswer({ choice: 'block' });
  const request = buildMockDecisionRequest({ rules: { rule_0: rule } });
  const result = buildMockDecisionResult({ answers: { rule_0: answer } });

  expect(classifyJevAnswers(request, result)).toStrictEqual({
    kind: 'deny',
    rule: 'Secret Persistence',
    pBlock: 1,
  });
});
