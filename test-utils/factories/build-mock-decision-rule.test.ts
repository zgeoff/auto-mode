import { expect, test } from 'bun:test';
import { buildMockDecisionRule } from './build-mock-decision-rule.ts';

test('it builds a default decision rule', () => {
  expect(buildMockDecisionRule()).toStrictEqual({
    name: expect.toBeString(),
    tier: 'hard',
    source: 'shipped',
    text: expect.toBeString(),
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockDecisionRule({ name: 'Git Destructive', tier: 'soft' })).toStrictEqual({
    name: 'Git Destructive',
    tier: 'soft',
    source: 'shipped',
    text: expect.toBeString(),
  });
});
