import { expect, test } from 'claude-code/testing';
import { buildMockPermissionDecision } from './build-mock-permission-decision.ts';

test('it builds a default permission decision', () => {
  expect(buildMockPermissionDecision()).toStrictEqual({
    decision: 'ask',
    reason: 'Existing permission decision',
    rule: 'Bash(git push:*)',
    hook: 'PreToolUse',
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockPermissionDecision({ decision: 'deny', rule: 'Bash(rm:*)' })).toStrictEqual({
    decision: 'deny',
    reason: 'Existing permission decision',
    rule: 'Bash(rm:*)',
    hook: 'PreToolUse',
  });
});
