import { expect, test } from 'bun:test';
import { parseDecision } from '../mods/auto-mode/hooks/parse-decision.ts';
import { renderVerdict } from '../src/request/render-verdict.ts';

test('it hands the mod an allow it reads as an allow', () => {
  expect(parseDecision(renderVerdict({ kind: 'allow' }))).toStrictEqual({ decision: 'allow' });
});

test('it hands the mod a denial it reads with the rule-named reason', () => {
  const rendered = renderVerdict({
    kind: 'deny',
    rule: 'History Rewrite',
    reason: 'Force-pushing to main rewrites shared history.',
  });

  expect(parseDecision(rendered)).toStrictEqual({
    decision: 'deny',
    reason: '[History Rewrite] Force-pushing to main rewrites shared history.',
  });
});
