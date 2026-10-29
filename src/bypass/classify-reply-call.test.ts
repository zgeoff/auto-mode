import { expect, test } from 'bun:test';
import { buildMockOwnedScope } from '../../test-utils/factories/build-mock-owned-scope.ts';
import { classifyReplyCall } from './classify-reply-call.ts';

test('it allows a message to a reply-channel recipient', async () => {
  const scope = buildMockOwnedScope({
    replyChannels: [{ tool: 'SendMessage', field: 'to', recipient: 'lead' }],
  });

  const reply = await classifyReplyCall(
    { toolName: 'SendMessage', toolInput: { to: 'lead', message: 'the build is green' } },
    scope,
    false,
  );

  expect(reply).toStrictEqual({
    kind: 'bypass',
    channel: { tool: 'SendMessage', field: 'to', recipient: 'lead' },
  });
});

test('it exempts a message to a reply-channel recipient from Outbound Communication when the user configured deny entries', async () => {
  const scope = buildMockOwnedScope({
    replyChannels: [{ tool: 'SendMessage', field: 'to', recipient: 'lead' }],
  });

  const reply = await classifyReplyCall(
    { toolName: 'SendMessage', toolInput: { to: 'lead', message: 'the build is green' } },
    scope,
    true,
  );

  expect(reply).toStrictEqual({ kind: 'exempt', rules: ['Outbound Communication'] });
});

test('it exempts nothing for a message to a recipient no reply channel lists', async () => {
  const scope = buildMockOwnedScope({
    replyChannels: [{ tool: 'SendMessage', field: 'to', recipient: 'lead' }],
  });

  const reply = await classifyReplyCall(
    { toolName: 'SendMessage', toolInput: { to: 'archive', message: 'the build is green' } },
    scope,
    true,
  );

  expect(reply).toStrictEqual({ kind: 'none' });
});

test('it exempts nothing for a reply-channel message that carries a secret', async () => {
  const scope = buildMockOwnedScope({
    replyChannels: [{ tool: 'SendMessage', field: 'to', recipient: 'lead' }],
  });

  const key = ['AKIA', 'Z7QW3RTY5UIOP2LK'].join('');

  const reply = await classifyReplyCall(
    { toolName: 'SendMessage', toolInput: { to: 'lead', message: `aws_access_key_id = "${key}"` } },
    scope,
    true,
  );

  expect(reply).toStrictEqual({ kind: 'none' });
});

test('it exempts nothing when the task scope did not load', async () => {
  const reply = await classifyReplyCall(
    { toolName: 'SendMessage', toolInput: { to: 'lead', message: 'the build is green' } },
    null,
    true,
  );

  expect(reply).toStrictEqual({ kind: 'none' });
});
