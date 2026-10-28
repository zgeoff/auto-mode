import { expect, test } from 'bun:test';
import { findReplyChannel } from './find-reply-channel.ts';

test('it finds the reply channel whose tool and recipient the call names', () => {
  expect(
    findReplyChannel('SendMessage', { to: 'lead', message: 'done' }, [
      { tool: 'SendMessage', field: 'to', recipient: 'reviewer' },
      { tool: 'SendMessage', field: 'to', recipient: 'lead' },
    ]),
  ).toStrictEqual({ tool: 'SendMessage', field: 'to', recipient: 'lead' });
});

test('it finds no reply channel for a call to another recipient', () => {
  expect(
    findReplyChannel('SendMessage', { to: 'everyone', message: 'done' }, [
      { tool: 'SendMessage', field: 'to', recipient: 'lead' },
    ]),
  ).toBeNull();
});

test('it finds no reply channel for another tool that names the recipient', () => {
  expect(
    findReplyChannel('mcp__chat__post', { to: 'lead', message: 'done' }, [
      { tool: 'SendMessage', field: 'to', recipient: 'lead' },
    ]),
  ).toBeNull();
});

test('it finds no reply channel when the recipient sits in another field of the input', () => {
  expect(
    findReplyChannel('SendMessage', { to: 'everyone', message: 'lead' }, [
      { tool: 'SendMessage', field: 'to', recipient: 'lead' },
    ]),
  ).toBeNull();
});
