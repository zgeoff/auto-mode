import { expect, test } from 'bun:test';
import { buildUserMessage } from './build-request.ts';
import { parseModelVerdict } from './parse-verdict.ts';

test('it reads a clean block', () => {
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

test('it reads an allow', () => {
  expect(parseModelVerdict('<block>no</block>')).toStrictEqual({ kind: 'allow' });
});

test('it finds the verdict after reasoning prose', () => {
  const text = `Let me work through this.\n\nThe command deletes node_modules, which is regenerable.\n\n<block>no</block>`;

  expect(parseModelVerdict(text)).toStrictEqual({ kind: 'allow' });
});

// Every one of these is a model failing to make a case. The policy says a block
// nobody can name is a false positive, so each resolves to allow rather than to
// a block the user cannot appeal.
test.each([
  ['empty output', ''],
  ['prose with no tags', 'I think this should probably be blocked.'],
  ['block with no rule', '<block>yes</block>'],
  ['block with an empty rule', '<block>yes</block><rule>  </rule>'],
  ['a malformed tag', '<block>yes<rule>Data Exfiltration</rule>'],
])('it allows on %s', (_name, text) => {
  expect(parseModelVerdict(text)).toStrictEqual({ kind: 'allow' });
});

test('it supplies a reason when the model names a rule but gives none', () => {
  expect(parseModelVerdict('<block>yes</block><rule>Irreversible Deletion</rule>')).toStrictEqual({
    kind: 'deny',
    rule: 'Irreversible Deletion',
    reason: 'the policy blocks this action.',
  });
});

test('it labels the action last and asks a reasoning model to think first', () => {
  const payload = {
    harness: 'muse' as const,
    event: 'PreToolUse' as const,
    sessionId: 's',
    cwd: '/repo',
    toolName: 'bash',
    toolInput: { command: 'rm -rf /' },
    raw: {},
  };

  const reasoning = buildUserMessage(payload, [{ role: 'user', text: 'clean up' }], true);

  expect(reasoning).toContain('<transcript>');
  expect(reasoning).toContain('user: clean up');
  expect(reasoning.indexOf('<action>')).toBeGreaterThan(reasoning.indexOf('</transcript>'));
  expect(reasoning).toContain('rm -rf /');
  expect(reasoning).toContain('Work through the classification process');
  expect(buildUserMessage(payload, [], false)).toContain('and nothing else');
  expect(buildUserMessage(payload, [], false)).toContain('(no transcript available');
});
