import { expect, test } from 'bun:test';
import { renderVerdict } from './render-verdict.ts';

// All three harnesses read the same shape, and permissionDecision must sit
// inside hookSpecificOutput or none of them sees it.
test('it nests the decision inside hookSpecificOutput', () => {
  const rendered: unknown = JSON.parse(renderVerdict('PreToolUse', { kind: 'allow' }));

  expect(rendered).toStrictEqual({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' },
  });
});

test('it reports the event it was given', () => {
  const rendered: unknown = JSON.parse(renderVerdict('PermissionRequest', { kind: 'ask' }));

  expect(rendered).toStrictEqual({
    hookSpecificOutput: { hookEventName: 'PermissionRequest', permissionDecision: 'ask' },
  });
});

test('it carries no reason on an allow or an ask', () => {
  expect(renderVerdict('PreToolUse', { kind: 'allow' })).not.toInclude('permissionDecisionReason');
  expect(renderVerdict('PreToolUse', { kind: 'ask' })).not.toInclude('permissionDecisionReason');
});

// The reason reaches the agent verbatim, and it opens with the rule name so the
// agent and the user can both see which rule stopped the action.
test('it opens a denial reason with the rule name in brackets', () => {
  const rendered: unknown = JSON.parse(
    renderVerdict('PreToolUse', {
      kind: 'deny',
      rule: 'History Rewrite',
      reason: 'Force-pushing to main rewrites shared history.',
    }),
  );

  expect(rendered).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: '[History Rewrite] Force-pushing to main rewrites shared history.',
    },
  });
});
