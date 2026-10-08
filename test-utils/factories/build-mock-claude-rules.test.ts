import { expect, test } from 'bun:test';
import { buildMockClaudeRules } from './build-mock-claude-rules.ts';

test('it builds a default claude rules', () => {
  expect(buildMockClaudeRules()).toStrictEqual({
    environment: [],
    allow: [],
    soft_deny: [],
    hard_deny: [],
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockClaudeRules({ hard_deny: ['Never push to main'] })).toStrictEqual({
    environment: [],
    allow: [],
    soft_deny: [],
    hard_deny: ['Never push to main'],
  });
});
