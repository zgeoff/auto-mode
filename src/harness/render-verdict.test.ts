import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { renderVerdict } from './render-verdict.ts';

function parseVerdict(rendered: string | null): unknown {
  invariant(rendered !== null, 'the verdict was rendered');

  return JSON.parse(rendered);
}

// permissionDecision must sit inside hookSpecificOutput or the harness never
// sees it.
test('it nests the decision inside hookSpecificOutput', () => {
  expect(parseVerdict(renderVerdict('PreToolUse', { kind: 'allow' }))).toStrictEqual({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' },
  });
});

// PreToolUse runs before the harness has decided anything, so an ask there is a
// decision: it sends the call to a prompt the harness would have skipped.
test('it asks on PreToolUse with a flat decision', () => {
  expect(parseVerdict(renderVerdict('PreToolUse', { kind: 'ask' }))).toStrictEqual({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask' },
  });
});

test('it carries no reason on an allow or an ask', () => {
  expect(renderVerdict('PreToolUse', { kind: 'allow' })).not.toInclude('permissionDecisionReason');
  expect(renderVerdict('PreToolUse', { kind: 'ask' })).not.toInclude('permissionDecisionReason');
});

// The reason reaches the agent verbatim, and it opens with the rule name so the
// agent and the user can both see which rule stopped the action.
test('it opens a denial reason with the rule name in brackets', () => {
  const rendered = renderVerdict('PreToolUse', {
    kind: 'deny',
    rule: 'History Rewrite',
    reason: 'Force-pushing to main rewrites shared history.',
  });

  expect(parseVerdict(rendered)).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: '[History Rewrite] Force-pushing to main rewrites shared history.',
    },
  });
});

// PermissionRequest takes a nested decision object, and a flat
// permissionDecision on it is refused as a malformed hook output.
test('it allows on PermissionRequest with a nested behavior', () => {
  expect(parseVerdict(renderVerdict('PermissionRequest', { kind: 'allow' }))).toStrictEqual({
    hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } },
  });
});

test('it denies on PermissionRequest with the reason as the message', () => {
  const rendered = renderVerdict('PermissionRequest', {
    kind: 'deny',
    rule: 'History Rewrite',
    reason: 'Force-pushing to main rewrites shared history.',
  });

  expect(parseVerdict(rendered)).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: {
        behavior: 'deny',
        message: '[History Rewrite] Force-pushing to main rewrites shared history.',
      },
    },
  });
});

// PermissionRequest fires when the harness is already on its way to the prompt,
// so its contract has allow and deny and nothing else: the prompt is what
// happens when the hook answers nothing at all.
test('it renders nothing to ask on PermissionRequest', () => {
  expect(renderVerdict('PermissionRequest', { kind: 'ask' })).toBeNull();
});

// The two events name their decision differently, and each harness refuses the
// other event's spelling, so this pair is asserted together to stop a future
// edit unifying them.
test('it keeps the two events spelling their decision apart', () => {
  expect(renderVerdict('PreToolUse', { kind: 'allow' })).not.toInclude('"decision"');

  expect(renderVerdict('PermissionRequest', { kind: 'allow' })).not.toInclude(
    '"permissionDecision"',
  );
});
