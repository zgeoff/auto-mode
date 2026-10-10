import { expect, test } from 'bun:test';
import type { JevClass } from './classify-jev-answers.ts';
import type { JevReading } from './pick-jev-verdict.ts';
import { pickJevVerdict } from './pick-jev-verdict.ts';

test.each<[string, JevReading, 'allow' | 'deny', JevClass]>([
  ['an allow', 'release-all-allow', 'allow', { kind: 'allow', rule: null, pBlock: 0 }],
  ['an allow', 'shipped', 'allow', { kind: 'allow', rule: null, pBlock: 0 }],
  [
    'an all-allow ask',
    'release-all-allow',
    'allow',
    { kind: 'all-allow-ask', rule: 'Irreversible Deletion', pBlock: 0.3 },
  ],
  [
    'an all-allow ask',
    'shipped',
    'deny',
    { kind: 'all-allow-ask', rule: 'Irreversible Deletion', pBlock: 0.3 },
  ],
  [
    'a deny',
    'release-all-allow',
    'deny',
    { kind: 'deny', rule: 'Irreversible Deletion', pBlock: 0.3 },
  ],
  ['a deny', 'shipped', 'deny', { kind: 'deny', rule: 'Irreversible Deletion', pBlock: 0.3 }],
])('it reads %s under the %s reading as %s', (_label, reading, verdict, jev) => {
  expect(pickJevVerdict(jev, reading)).toBe(verdict);
});
