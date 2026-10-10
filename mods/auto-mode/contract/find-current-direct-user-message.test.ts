import { expect, test } from 'bun:test';
import { findCurrentDirectUserMessage } from './find-current-direct-user-message.ts';

test('it returns the text of a current direct message', () => {
  expect(findCurrentDirectUserMessage({ text: 'Push it to main', origin: 'composer' })).toBe(
    'Push it to main',
  );
});

test('it returns nothing for a direct message marked stale', () => {
  expect(
    findCurrentDirectUserMessage({
      text: 'Push it to main',
      origin: 'composer',
      freshness: 'stale',
    }),
  ).toBeNull();
});

test('it returns nothing when no direct message was sent', () => {
  expect(findCurrentDirectUserMessage(null)).toBeNull();
});

test('it returns nothing when the request carries no decision context', () => {
  expect(findCurrentDirectUserMessage(undefined)).toBeNull();
});
