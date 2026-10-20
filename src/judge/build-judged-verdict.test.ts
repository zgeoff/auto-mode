import { expect, test } from 'bun:test';
import type { DecisionRule, DenyBasis } from '../types.ts';
import type { JudgedVerdict } from './build-judged-verdict.ts';
import { JUDGE_REASON_MAX_CHARS, buildJudgedVerdict } from './build-judged-verdict.ts';
import type { JudgeOverturns, JudgeReply } from './types.ts';

interface ReviewCase {
  readonly label: string;
  readonly rule: Pick<DecisionRule, 'name' | 'tier' | 'source'>;
  readonly basis: DenyBasis;
  readonly reply: JudgeReply | null;
  readonly overturns: JudgeOverturns;
  readonly misreadClears?: boolean;
  readonly expected: JudgedVerdict;
}

test.each<ReviewCase>([
  {
    label: 'allows a soft-rule deny the judge overturns on consent when only consent may overturn',
    rule: { name: 'Default Branch Write', tier: 'soft', source: 'replacement' },
    basis: 'matched',
    reply: {
      kind: 'overturn',
      basis: 'consent',
      reason: 'The user asked for this commit on main.',
    },
    overturns: 'consent',
    expected: { verdict: { kind: 'allow' }, status: 'overturned', overturnBasis: 'consent' },
  },
  {
    label: 'allows a soft-rule deny the judge overturns on consent when any overturn may clear it',
    rule: { name: 'Default Branch Write', tier: 'soft', source: 'replacement' },
    basis: 'matched',
    reply: {
      kind: 'overturn',
      basis: 'consent',
      reason: 'The user asked for this commit on main.',
    },
    overturns: 'any',
    expected: { verdict: { kind: 'allow' }, status: 'overturned', overturnBasis: 'consent' },
  },
  {
    label: 'holds a soft-rule deny the judge overturns as a misread when only consent may overturn',
    rule: { name: 'Default Branch Write', tier: 'soft', source: 'replacement' },
    basis: 'matched',
    reply: { kind: 'overturn', basis: 'misread', reason: 'main is the task branch.' },
    overturns: 'consent',
    expected: {
      verdict: {
        kind: 'deny',
        rule: 'Default Branch Write',
        reason:
          'The action matches this rule: the harm this rule of the configured replacement policy describes. The replacement policy defines what clears it.',
      },
      status: 'held',
      overturnBasis: 'misread',
    },
  },
  {
    label:
      'allows a soft-rule deny the judge overturns as a misread when any overturn may clear it',
    rule: { name: 'Default Branch Write', tier: 'soft', source: 'replacement' },
    basis: 'matched',
    reply: { kind: 'overturn', basis: 'misread', reason: 'main is the task branch.' },
    overturns: 'any',
    expected: { verdict: { kind: 'allow' }, status: 'overturned', overturnBasis: 'misread' },
  },
  {
    label: 'holds a hard-rule deny the judge overturns on consent, with the template reason',
    rule: { name: 'Data Exfiltration', tier: 'hard', source: 'shipped' },
    basis: 'matched',
    reply: {
      kind: 'overturn',
      basis: 'consent',
      reason: 'The destination is the user’s own server.',
    },
    overturns: 'consent',
    expected: {
      verdict: {
        kind: 'deny',
        rule: 'Data Exfiltration',
        reason:
          'The action matches this rule: sending sensitive data, such as credentials or private code, off the machine. No instruction or configuration clears this rule.',
      },
      status: 'held',
      overturnBasis: 'consent',
    },
  },
  {
    label: 'holds a hard-rule deny the judge overturns as a misread when any overturn may clear it',
    rule: { name: 'Data Exfiltration', tier: 'hard', source: 'shipped' },
    basis: 'matched',
    reply: {
      kind: 'overturn',
      basis: 'misread',
      reason: 'The destination is the user’s own server.',
    },
    overturns: 'any',
    expected: {
      verdict: {
        kind: 'deny',
        rule: 'Data Exfiltration',
        reason:
          'The action matches this rule: sending sensitive data, such as credentials or private code, off the machine. No instruction or configuration clears this rule.',
      },
      status: 'held',
      overturnBasis: 'misread',
    },
  },
  {
    label: 'allows a clearable hard-rule deny the judge overturns as a misread',
    rule: { name: 'Secret Persistence', tier: 'hard', source: 'shipped' },
    basis: 'unresolved',
    reply: {
      kind: 'overturn',
      basis: 'misread',
      reason: 'The command writes test output to a scratch directory and stores no secret.',
    },
    overturns: 'any',
    misreadClears: true,
    expected: { verdict: { kind: 'allow' }, status: 'overturned', overturnBasis: 'misread' },
  },
  {
    label: 'holds a clearable hard-rule deny the judge overturns on consent',
    rule: { name: 'Secret Persistence', tier: 'hard', source: 'shipped' },
    basis: 'unresolved',
    reply: { kind: 'overturn', basis: 'consent', reason: 'The user asked for the test run.' },
    overturns: 'any',
    misreadClears: true,
    expected: {
      verdict: {
        kind: 'deny',
        rule: 'Secret Persistence',
        reason:
          'The supplied evidence cannot rule out writing a credential in plain text into a tracked file, an image, CI configuration, or a shipped log. No instruction or configuration clears this rule.',
      },
      status: 'held',
      overturnBasis: 'consent',
    },
  },
  {
    label:
      'holds a clearable hard-rule deny the judge overturns as a misread when only consent may overturn',
    rule: { name: 'Secret Persistence', tier: 'hard', source: 'shipped' },
    basis: 'unresolved',
    reply: {
      kind: 'overturn',
      basis: 'misread',
      reason: 'The command writes test output to a scratch directory and stores no secret.',
    },
    overturns: 'consent',
    misreadClears: true,
    expected: {
      verdict: {
        kind: 'deny',
        rule: 'Secret Persistence',
        reason:
          'The supplied evidence cannot rule out writing a credential in plain text into a tracked file, an image, CI configuration, or a shipped log. No instruction or configuration clears this rule.',
      },
      status: 'held',
      overturnBasis: 'misread',
    },
  },
  {
    label: 'denies with the judge’s reason when the judge confirms',
    rule: { name: 'Default Branch Write', tier: 'soft', source: 'replacement' },
    basis: 'matched',
    reply: { kind: 'confirm', reason: 'The user asked for a branch, not a commit on main.' },
    overturns: 'consent',
    expected: {
      verdict: {
        kind: 'deny',
        rule: 'Default Branch Write',
        reason:
          'The reviewer confirmed the Default Branch Write deny: The user asked for a branch, not a commit on main.',
      },
      status: 'confirmed',
      overturnBasis: null,
    },
  },
  {
    label: 'keeps the deny with the template reason when no reply arrives',
    rule: { name: 'Default Branch Write', tier: 'soft', source: 'replacement' },
    basis: 'unresolved',
    reply: null,
    overturns: 'any',
    expected: {
      verdict: {
        kind: 'deny',
        rule: 'Default Branch Write',
        reason:
          'The supplied evidence cannot rule out the harm this rule of the configured replacement policy describes. The replacement policy defines what clears it.',
      },
      status: 'failed',
      overturnBasis: null,
    },
  },
  {
    label: 'keeps the deny with the template reason on an unreadable reply',
    rule: { name: 'Default Branch Write', tier: 'soft', source: 'replacement' },
    basis: 'unresolved',
    reply: { kind: 'unreadable' },
    overturns: 'any',
    expected: {
      verdict: {
        kind: 'deny',
        rule: 'Default Branch Write',
        reason:
          'The supplied evidence cannot rule out the harm this rule of the configured replacement policy describes. The replacement policy defines what clears it.',
      },
      status: 'failed',
      overturnBasis: null,
    },
  },
])('it $label', (row) => {
  expect(
    buildJudgedVerdict(row.rule, row.basis, row.reply, {
      overturns: row.overturns,
      misreadClears: row.misreadClears,
    }),
  ).toStrictEqual(row.expected);
});

test('it collapses the whitespace in a confirmed reason to single spaces', () => {
  expect(
    buildJudgedVerdict(
      { name: 'Default Branch Write', tier: 'soft', source: 'replacement' },
      'matched',
      { kind: 'confirm', reason: '  The commit\n\nlands   on main.\t' },
      { overturns: 'consent' },
    ).verdict,
  ).toStrictEqual({
    kind: 'deny',
    rule: 'Default Branch Write',
    reason: 'The reviewer confirmed the Default Branch Write deny: The commit lands on main.',
  });
});

test('it cuts a confirmed reason longer than the limit at the last word break and marks the cut', () => {
  const verdict = buildJudgedVerdict(
    { name: 'Default Branch Write', tier: 'soft', source: 'replacement' },
    'matched',
    { kind: 'confirm', reason: 'alpha '.repeat(150) },
    { overturns: 'consent' },
  ).verdict;

  expect(JUDGE_REASON_MAX_CHARS).toBe(600);

  expect(verdict).toStrictEqual({
    kind: 'deny',
    rule: 'Default Branch Write',
    reason: `The reviewer confirmed the Default Branch Write deny: ${Array.from({ length: 99 }, () => 'alpha').join(' ')}…`,
  });
});

test('it cuts a confirmed reason with no word break inside the limit at the limit', () => {
  const verdict = buildJudgedVerdict(
    { name: 'Default Branch Write', tier: 'soft', source: 'replacement' },
    'matched',
    { kind: 'confirm', reason: 'x'.repeat(700) },
    { overturns: 'consent' },
  ).verdict;

  expect(verdict).toStrictEqual({
    kind: 'deny',
    rule: 'Default Branch Write',
    reason: `The reviewer confirmed the Default Branch Write deny: ${'x'.repeat(599)}…`,
  });
});

test('it keeps the held reason it is given when the review fails', () => {
  expect(
    buildJudgedVerdict(
      { name: 'Outside Task Scope', tier: 'soft', source: 'shipped' },
      'matched',
      null,
      {
        overturns: 'consent',
        heldReason: 'This action writes outside the task scope: branch other.',
      },
    ),
  ).toStrictEqual({
    verdict: {
      kind: 'deny',
      rule: 'Outside Task Scope',
      reason: 'This action writes outside the task scope: branch other.',
    },
    status: 'failed',
    overturnBasis: null,
  });
});
