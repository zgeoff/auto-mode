import { expect, test } from 'bun:test';
import { buildDenyReason } from './build-deny-reason.ts';

test('it renders a matched and an unresolved reason from the same template', () => {
  const rule = { name: 'Publish and Release', tier: 'soft', source: 'shipped' } as const;

  expect([buildDenyReason(rule, 'matched'), buildDenyReason(rule, 'unresolved')]).toStrictEqual([
    'The action matches this rule: putting an artifact where other people install it. A direct user instruction that says publish, release, or deploy and names the target clears it.',
    'The supplied evidence cannot rule out putting an artifact where other people install it. A direct user instruction that says publish, release, or deploy and names the target clears it.',
  ]);
});

test('it states that nothing clears a shipped hard rule without a clarification path', () => {
  expect(
    buildDenyReason({ name: 'Data Exfiltration', tier: 'hard', source: 'shipped' }, 'matched'),
  ).toBe(
    'The action matches this rule: sending sensitive data, such as credentials or private code, off the machine. No instruction or configuration clears this rule.',
  );
});

test('it gives a configured hard deny entry a reason that only configuration clears', () => {
  expect(
    buildDenyReason(
      { name: 'Configured hard_deny 1', tier: 'hard', source: 'configured' },
      'matched',
    ),
  ).toBe(
    "The action matches this rule: an action that a hard deny entry in the user's auto-mode configuration covers. Only a change to that configuration clears it.",
  );
});

test('it gives a configured soft deny entry a reason that a specific instruction clears', () => {
  expect(
    buildDenyReason(
      { name: 'Configured soft_deny 1', tier: 'soft', source: 'configured' },
      'unresolved',
    ),
  ).toBe(
    "The supplied evidence cannot rule out an action that a soft deny entry in the user's auto-mode configuration covers. A direct user instruction that asks for this specific action clears it.",
  );
});

test('it throws for a shipped rule name that has no template', () => {
  expect(() =>
    buildDenyReason({ name: 'Unknown Rule', tier: 'soft', source: 'shipped' }, 'matched'),
  ).toThrowWithMessage(Error, /No deny reason for the shipped rule Unknown Rule/u);
});
