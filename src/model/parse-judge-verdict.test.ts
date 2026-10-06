import { expect, test } from 'bun:test';
import { parseJudgeVerdict } from './parse-judge-verdict.ts';

test.each([
  ['an empty reply', '', { kind: 'unreadable' }],
  ['prose without the contract tags', 'This looks safe to run.', { kind: 'unreadable' }],
  ['an unknown block answer', '<block>maybe</block>', { kind: 'unreadable' }],
  [
    'a named block',
    '<block>yes</block><rule>Irreversible Deletion</rule><reason>[Irreversible Deletion] x.</reason>',
    { kind: 'block', rule: 'Irreversible Deletion' },
  ],
  ['an unnamed block', '<block>yes</block>', { kind: 'block', rule: null }],
  [
    'a block after an allow',
    '<block>no</block> then <block>yes</block>',
    { kind: 'block', rule: null },
  ],
  ['an unclosed block after an allow', '<block>no</block>\n<block>yes', { kind: 'unreadable' }],
  [
    'a nested block after an allow',
    '<block>no</block>\n<block><answer>yes</answer></block>',
    { kind: 'unreadable' },
  ],
  ['a stray closing tag', '</block><block>no</block>', { kind: 'unreadable' }],
  ['a bare allow', '<block>no</block>', { kind: 'allow' }],
  [
    'reasoning that ends in an allow',
    'The path is regenerable.\n<block> NO </block>',
    { kind: 'allow' },
  ],
] as const)('it reads %s', (_label, text, verdict) => {
  expect(parseJudgeVerdict(text)).toStrictEqual(verdict);
});
