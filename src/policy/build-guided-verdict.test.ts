import { expect, test } from 'bun:test';
import { buildGuidedVerdict } from './build-guided-verdict.ts';

test.each([
  ['a reason that ends a sentence', 'Pushes to main.', 'Ask first.', 'Pushes to main. Ask first.'],
  ['a reason with no full stop', 'Pushes to main', 'Ask first.', 'Pushes to main. Ask first.'],
  [
    'a reason that ends with a question mark',
    'Pushes to main?',
    'Ask first.',
    'Pushes to main? Ask first.',
  ],
  ['unreadable guidance', 'Pushes to main', null, 'Pushes to main.'],
])(
  'it ends the reason of a deny with the guidance, given %s',
  (_label, reason, guidance, expected) => {
    expect(
      buildGuidedVerdict({ kind: 'deny', rule: 'Default Branch Write', reason }, guidance),
    ).toStrictEqual({
      kind: 'deny',
      rule: 'Default Branch Write',
      reason: expected,
    });
  },
);

test('it leaves an allow as it is', () => {
  expect(buildGuidedVerdict({ kind: 'allow' }, 'Ask first.')).toStrictEqual({ kind: 'allow' });
});
