import { expect, test } from 'bun:test';
import { parseJudgeVerdict } from './parse-judge-verdict.ts';

test.each([
  ['an empty reply', ''],
  ['prose without the contract tags', 'This looks safe to run.'],
  ['an unknown block answer', '<block>maybe</block>'],
  ['an unclosed block after an allow', '<block>no</block>\n<block>yes'],
  ['a nested block after an allow', '<block>no</block>\n<block><answer>yes</answer></block>'],
  ['a stray closing tag', '</block><block>no</block>'],
] as const)('it reads %s as unreadable', (_label, text) => {
  expect(parseJudgeVerdict(text)).toStrictEqual({ kind: 'unreadable' });
});

test.each([
  [
    'a named block',
    '<block>yes</block><rule>Irreversible Deletion</rule><reason>[Irreversible Deletion] x.</reason>',
    'Irreversible Deletion',
  ],
  ['an unnamed block', '<block>yes</block>', null],
  ['a block after an allow', '<block>no</block> then <block>yes</block>', null],
] as const)('it reads %s as a block naming the rule it gives', (_label, text, rule) => {
  expect(parseJudgeVerdict(text)).toStrictEqual({ kind: 'block', rule });
});

test.each([
  ['a bare allow', '<block>no</block>'],
  ['reasoning that ends in an allow', 'The path is regenerable.\n<block> NO </block>'],
] as const)('it reads %s as an allow', (_label, text) => {
  expect(parseJudgeVerdict(text)).toStrictEqual({ kind: 'allow' });
});
