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

test('it sends a secret held as the value of an input key named for it to Jev', () => {
  const value = ['9fe027a15d', '63b8c4a760d391e582f0bcd'].join('');

  expect(classifyReplyMessage({ to: 'lead', adafruit_api_key: value })).toStrictEqual({
    kind: 'jev',
    reason: 'secret scan matched generic-api-key',
  });
});

test('it sends a private key block that spans lines of a message to Jev', () => {
  const block = [
    ['-----BEGIN', 'PRIVATE KEY-----'].join(' '),
    'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj',
    'MzEfYyjiWA4R4/M2bS1GB4t7NXp98C3SC6dVMvDuictGeurT8jNbvJZHtCSuYEvu',
    'NMoSfm76oqFvAp8Gy0iz5sxjZmSnXyCdPEovGhLa0VzMaQ8s+CLOyS56YyCFGeJZ',
    ['-----END', 'PRIVATE KEY-----'].join(' '),
  ].join('\n');

  expect(classifyReplyMessage({ to: 'lead', message: block })).toStrictEqual({
    kind: 'jev',
    reason: 'secret scan matched private-key',
  });
});

test('it scans a message one byte under the size the scan reads', () => {
  // The scan reads the JSON text and each string: 2 × 131060 + 23 bytes.
  expect(classifyReplyMessage({ message: 'a'.repeat(131_060) })).toStrictEqual({ kind: 'bypass' });
});

test('it sends a message one byte larger than the scan reads to Jev without scanning part of it', () => {
  // The scan reads the JSON text and each string: 2 × 131061 + 23 bytes.
  expect(classifyReplyMessage({ message: 'a'.repeat(131_061) })).toStrictEqual({
    kind: 'jev',
    reason: 'message larger than the secret scan reads',
  });
});
