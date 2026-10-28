import { expect, test } from 'bun:test';
import { buildMockActionRequest } from '../../test-utils/factories/build-mock-action-request.ts';
import { findReplyChannel } from './find-reply-channel.ts';

test('it finds the reply channel whose tool and recipient the call names', () => {
  const request = buildMockActionRequest({
    toolName: 'SendMessage',
    toolInput: { to: 'lead', message: 'done' },
  });

  expect(
    findReplyChannel(request, [
      { tool: 'SendMessage', field: 'to', recipient: 'reviewer' },
      { tool: 'SendMessage', field: 'to', recipient: 'lead' },
    ]),
  ).toStrictEqual({ tool: 'SendMessage', field: 'to', recipient: 'lead' });
});

test('it finds no reply channel for a call to another recipient', () => {
  const request = buildMockActionRequest({
    toolName: 'SendMessage',
    toolInput: { to: 'everyone', message: 'done' },
  });

  expect(
    findReplyChannel(request, [{ tool: 'SendMessage', field: 'to', recipient: 'lead' }]),
  ).toBeNull();
});

test('it finds no reply channel for another tool that names the recipient', () => {
  const request = buildMockActionRequest({
    toolName: 'mcp__chat__post',
    toolInput: { to: 'lead', message: 'done' },
  });

  expect(
    findReplyChannel(request, [{ tool: 'SendMessage', field: 'to', recipient: 'lead' }]),
  ).toBeNull();
});

test('it finds no reply channel when the recipient sits in another field of the input', () => {
  const request = buildMockActionRequest({
    toolName: 'SendMessage',
    toolInput: { to: 'everyone', message: 'lead' },
  });

  expect(
    findReplyChannel(request, [{ tool: 'SendMessage', field: 'to', recipient: 'lead' }]),
  ).toBeNull();
});
