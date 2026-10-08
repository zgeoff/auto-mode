import { expect, test } from 'bun:test';
import { secretRuleSetSchema } from './secret-rule-set-schema.ts';

test('it accepts a rule set with a windowed pattern and each kind of filter term', () => {
  const payload = {
    source: { repository: 'https://example.com/rules', version: 'v1.0.0', commit: 'abc123' },
    notice: 'MIT License\n',
    prefilter: [{ source: String.raw`\.lock$`, flags: '', engine: 'js' }],
    filter: [{ kind: 'contains', field: 'secret', values: ['EXAMPLE'], negate: false }],
    rules: [
      {
        id: 'curl-auth-header',
        pattern: {
          source: String.raw`\bcurl\b.+`,
          flags: '',
          engine: 're2',
          window: { start: 'curl', maxNewlines: 11 },
        },
        path: null,
        keywords: ['curl'],
        secretGroup: 1,
        filter: [
          { kind: 'entropy', op: '<', value: 3 },
          {
            kind: 'matches',
            field: 'line',
            patterns: [{ source: 'example', flags: 'i', engine: 'js' }],
            negate: true,
          },
        ],
        report: true,
      },
    ],
    unported: [{ rule: 'curl-auth-user', part: 'filter' }],
  } as const;

  expect(secretRuleSetSchema.parse(payload)).toStrictEqual(payload);
});

test('it rejects a pattern for an engine the scanner does not run', () => {
  const payload = {
    source: { repository: 'https://example.com/rules', version: 'v1.0.0', commit: 'abc123' },
    notice: 'MIT License\n',
    prefilter: [{ source: String.raw`\.lock$`, flags: '', engine: 'pcre' }],
    filter: [{ kind: 'contains', field: 'secret', values: ['EXAMPLE'], negate: false }],
    rules: [
      {
        id: 'curl-auth-header',
        pattern: {
          source: String.raw`\bcurl\b.+`,
          flags: '',
          engine: 're2',
          window: { start: 'curl', maxNewlines: 11 },
        },
        path: null,
        keywords: ['curl'],
        secretGroup: 1,
        filter: [
          { kind: 'entropy', op: '<', value: 3 },
          {
            kind: 'matches',
            field: 'line',
            patterns: [{ source: 'example', flags: 'i', engine: 'js' }],
            negate: true,
          },
        ],
        report: true,
      },
    ],
    unported: [{ rule: 'curl-auth-user', part: 'filter' }],
  };

  expect(secretRuleSetSchema.safeParse(payload).error?.issues).toPartiallyContain({
    path: ['prefilter', 0, 'engine'],
  });
});

// A field the scanner does not read is a generator change the scanner has not
// caught up with, so it fails the check instead of passing unread.
test('it rejects a rule that carries a field the scanner does not read', () => {
  const payload = {
    source: { repository: 'https://example.com/rules', version: 'v1.0.0', commit: 'abc123' },
    notice: 'MIT License\n',
    prefilter: [{ source: String.raw`\.lock$`, flags: '', engine: 'js' }],
    filter: [{ kind: 'contains', field: 'secret', values: ['EXAMPLE'], negate: false }],
    rules: [
      {
        id: 'curl-auth-header',
        pattern: {
          source: String.raw`\bcurl\b.+`,
          flags: '',
          engine: 're2',
          window: { start: 'curl', maxNewlines: 11 },
        },
        path: null,
        keywords: ['curl'],
        secretGroup: 1,
        filter: [
          { kind: 'entropy', op: '<', value: 3 },
          {
            kind: 'matches',
            field: 'line',
            patterns: [{ source: 'example', flags: 'i', engine: 'js' }],
            negate: true,
          },
        ],
        report: true,
        tags: ['curl'],
      },
    ],
    unported: [{ rule: 'curl-auth-user', part: 'filter' }],
  };

  expect(secretRuleSetSchema.safeParse(payload).error?.issues).toPartiallyContain({
    code: 'unrecognized_keys',
    path: ['rules', 0],
    keys: ['tags'],
  });
});
