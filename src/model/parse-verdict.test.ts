import { expect, test } from 'bun:test';
import { parseModelVerdict } from './parse-verdict.ts';

test('it reads a named block as a deny and strips the bracketed rule from its reason', () => {
  expect(
    parseModelVerdict(
      '<block>yes</block><rule>Data Exfiltration</rule><reason>[Data Exfiltration] the body carries a key.</reason>',
    ),
  ).toStrictEqual({
    kind: 'deny',
    rule: 'Data Exfiltration',

    // The renderer adds the bracketed prefix, so the parser strips it to stop
    // the reason reading "[X] [X] …".
    reason: 'the body carries a key.',
  });
});

test('it reads a bare allow as an allow', () => {
  expect(parseModelVerdict('<block>no</block>')).toStrictEqual({ kind: 'allow' });
});

test('it finds the verdict after reasoning prose', () => {
  const text = `Let me work through this.\n\nThe command deletes node_modules, which is regenerable.\n\n<block>no</block>`;

  expect(parseModelVerdict(text)).toStrictEqual({ kind: 'allow' });
});

test.each([
  ['empty output', ''],
  ['prose with no tags', 'I think this should probably be blocked.'],
  ['a block with no rule', '<block>yes</block>'],
  ['a block with an empty rule', '<block>yes</block><rule>  </rule>'],
  ['a malformed block tag', '<block>yes<rule>Data Exfiltration</rule>'],
  ['a block flag that is neither yes nor no', '<block>maybe</block><rule>Data Exfiltration</rule>'],
])('it reads %s as no verdict', (_name, text) => {
  expect(parseModelVerdict(text)).toBeNull();
});

test('it supplies the fixed reason when the model names a shipped rule but gives none', () => {
  expect(parseModelVerdict('<block>yes</block><rule>Irreversible Deletion</rule>')).toStrictEqual({
    kind: 'deny',
    rule: 'Irreversible Deletion',
    reason:
      'The action matches this rule: deleting data the task does not own or that nothing can restore. A direct user instruction that asks for this deletion and names the path clears it.',
  });
});

test('it supplies a generic reason when the model names an unknown rule but gives none', () => {
  expect(parseModelVerdict('<block>yes</block><rule>Custom Rule</rule>')).toStrictEqual({
    kind: 'deny',
    rule: 'Custom Rule',
    reason: 'The action matches this rule.',
  });
});
