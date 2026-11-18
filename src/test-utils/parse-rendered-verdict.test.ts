import { expect, test } from 'bun:test';
import { parseRenderedVerdict } from './parse-rendered-verdict.ts';

test('it hands the mod an allow it reads as an allow', () => {
  expect(parseRenderedVerdict({ kind: 'allow' })).toStrictEqual({ decision: 'allow' });
});

test('it hands the mod a denial it reads with the rule-named reason', () => {
  const decision = parseRenderedVerdict({
    kind: 'deny',
    rule: 'History Rewrite',
    reason: 'Force-pushing to main rewrites shared history.',
  });

  expect(decision).toStrictEqual({
    decision: 'deny',
    reason: '[History Rewrite] Force-pushing to main rewrites shared history.',
  });
});
