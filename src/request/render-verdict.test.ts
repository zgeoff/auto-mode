import { expect, test } from 'bun:test';
import { renderVerdict } from './render-verdict.ts';

test('it renders an allow as a bare decision', () => {
  expect(JSON.parse(renderVerdict({ kind: 'allow' }))).toStrictEqual({ decision: 'allow' });
});

test('it opens a denial reason with the rule name in brackets', () => {
  const rendered = renderVerdict({
    kind: 'deny',
    rule: 'History Rewrite',
    reason: 'Force-pushing to main rewrites shared history.',
  });

  expect(JSON.parse(rendered)).toStrictEqual({
    decision: 'deny',
    reason: '[History Rewrite] Force-pushing to main rewrites shared history.',
  });
});
