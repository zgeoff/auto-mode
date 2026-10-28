import { expect, test } from 'bun:test';
import { classifyReplyMessage } from './classify-reply-message.ts';

test('it bypasses a message with no secret', () => {
  expect(classifyReplyMessage({ to: 'lead', message: 'the build is green' })).toStrictEqual({
    kind: 'bypass',
  });
});

test('it sends a message with a secret to Jev and names the rule', () => {
  const key = ['AKIA', 'Z7QW3RTY5UIOP2LK'].join('');

  expect(
    classifyReplyMessage({ to: 'lead', message: `aws_access_key_id = "${key}"` }),
  ).toStrictEqual({ kind: 'jev', reason: 'secret scan matched aws-access-token' });
});

test('it scans a secret nested inside an object or a list of the input', () => {
  const key = ['AKIA', 'Z7QW3RTY5UIOP2LK'].join('');

  expect(
    classifyReplyMessage({
      to: 'lead',
      message: { parts: ['done', `aws_access_key_id = "${key}"`] },
    }),
  ).toStrictEqual({ kind: 'jev', reason: 'secret scan matched aws-access-token' });
});

test('it scans a message of exactly the size the scan reads', () => {
  expect(
    classifyReplyMessage({ message: 'a'.repeat(256 * 1024 - 'message\n'.length) }),
  ).toStrictEqual({ kind: 'bypass' });
});

test('it sends a message one byte larger than the scan reads to Jev without scanning part of it', () => {
  expect(
    classifyReplyMessage({ message: 'a'.repeat(256 * 1024 - 'message\n'.length + 1) }),
  ).toStrictEqual({ kind: 'jev', reason: 'message larger than the secret scan reads' });
});
