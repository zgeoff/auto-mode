import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { renderVerdict } from './render-verdict.ts';

function parseVerdict(rendered: string | null): unknown {
  invariant(rendered !== null, 'the verdict was rendered');

  return JSON.parse(rendered);
}

test('it renders an allow as a bare decision', () => {
  expect(parseVerdict(renderVerdict({ kind: 'allow' }))).toStrictEqual({ decision: 'allow' });
});

// The reason reaches the agent verbatim, and it opens with the rule name so the
// agent and the user can both see which rule stopped the action.
test('it opens a denial reason with the rule name in brackets', () => {
  const rendered = renderVerdict({
    kind: 'deny',
    rule: 'History Rewrite',
    reason: 'Force-pushing to main rewrites shared history.',
  });

  expect(parseVerdict(rendered)).toStrictEqual({
    decision: 'deny',
    reason: '[History Rewrite] Force-pushing to main rewrites shared history.',
  });
});

// Claude Code is already on its way to the prompt when the mod asks, so an ask
// is the prompt itself and the renderer writes nothing for it.
test('it renders nothing for an ask', () => {
  expect(renderVerdict({ kind: 'ask' })).toBeNull();
});
