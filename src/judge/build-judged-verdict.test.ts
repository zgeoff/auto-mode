import { expect, test } from 'bun:test';
import { JUDGE_REASON_MAX_CHARS, buildJudgedVerdict } from './build-judged-verdict.ts';

test.each([['consent'], ['any']] as const)(
  'it allows an action whose soft-rule deny the judge overturns on consent when %s may overturn',
  (overturns) => {
    expect(
      buildJudgedVerdict(
        { name: 'Default Branch Write', tier: 'soft', source: 'replacement' },
        'matched',
        { kind: 'overturn', basis: 'consent', reason: 'The user asked for this commit on main.' },
        overturns,
      ),
    ).toStrictEqual({ verdict: { kind: 'allow' }, status: 'overturned', overturnBasis: 'consent' });
  },
);

test('it holds a soft-rule deny the judge overturns as a misread when only consent may overturn', () => {
  expect(
    buildJudgedVerdict(
      { name: 'Default Branch Write', tier: 'soft', source: 'replacement' },
      'matched',
      { kind: 'overturn', basis: 'misread', reason: 'main is the task branch.' },
      'consent',
    ),
  ).toStrictEqual({
    verdict: {
      kind: 'deny',
      rule: 'Default Branch Write',
      reason:
        'The action matches this rule: the harm this rule of the configured replacement policy describes. The replacement policy defines what clears it.',
    },
    status: 'held',
    overturnBasis: 'misread',
  });
});

test('it allows an action whose soft-rule deny the judge overturns as a misread when any overturn may clear it', () => {
  expect(
    buildJudgedVerdict(
      { name: 'Default Branch Write', tier: 'soft', source: 'replacement' },
      'matched',
      { kind: 'overturn', basis: 'misread', reason: 'main is the task branch.' },
      'any',
    ),
  ).toStrictEqual({ verdict: { kind: 'allow' }, status: 'overturned', overturnBasis: 'misread' });
});

test.each([
  ['consent', 'consent'],
  ['misread', 'any'],
] as const)(
  'it holds a hard-rule deny the judge overturns on %s when %s may overturn, with the template reason',
  (basis, overturns) => {
    expect(
      buildJudgedVerdict(
        { name: 'Data Exfiltration', tier: 'hard', source: 'shipped' },
        'matched',
        { kind: 'overturn', basis, reason: 'The destination is the user’s own server.' },
        overturns,
      ),
    ).toStrictEqual({
      verdict: {
        kind: 'deny',
        rule: 'Data Exfiltration',
        reason:
          'The action matches this rule: sending sensitive data, such as credentials or private code, off the machine. No instruction or configuration clears this rule.',
      },
      status: 'held',
      overturnBasis: basis,
    });
  },
);

test('it denies with the judge’s reason when the judge confirms', () => {
  expect(
    buildJudgedVerdict(
      { name: 'Default Branch Write', tier: 'soft', source: 'replacement' },
      'matched',
      { kind: 'confirm', reason: 'The user asked for a branch, not a commit on main.' },
      'consent',
    ),
  ).toStrictEqual({
    verdict: {
      kind: 'deny',
      rule: 'Default Branch Write',
      reason:
        'The reviewer confirmed the Default Branch Write deny: The user asked for a branch, not a commit on main.',
    },
    status: 'confirmed',
    overturnBasis: null,
  });
});

test('it collapses the whitespace in a confirmed reason to single spaces', () => {
  expect(
    buildJudgedVerdict(
      { name: 'Default Branch Write', tier: 'soft', source: 'replacement' },
      'matched',
      { kind: 'confirm', reason: '  The commit\n\nlands   on main.\t' },
      'consent',
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
    'consent',
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
    'consent',
  ).verdict;

  expect(verdict).toStrictEqual({
    kind: 'deny',
    rule: 'Default Branch Write',
    reason: `The reviewer confirmed the Default Branch Write deny: ${'x'.repeat(599)}…`,
  });
});

test.each([
  ['no reply', null],
  ['an unreadable reply', { kind: 'unreadable' } as const],
])('it keeps the deny with the template reason on %s', (_label, reply) => {
  expect(
    buildJudgedVerdict(
      { name: 'Default Branch Write', tier: 'soft', source: 'replacement' },
      'unresolved',
      reply,
      'any',
    ),
  ).toStrictEqual({
    verdict: {
      kind: 'deny',
      rule: 'Default Branch Write',
      reason:
        'The supplied evidence cannot rule out the harm this rule of the configured replacement policy describes. The replacement policy defines what clears it.',
    },
    status: 'failed',
    overturnBasis: null,
  });
});
