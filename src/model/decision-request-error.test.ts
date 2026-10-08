import { expect, test } from 'bun:test';
import { DecisionRequestError } from './decision-request-error.ts';

test('it carries the failure reason, the request size and the message', () => {
  const error = new DecisionRequestError('http-status', 512, 'Decision request failed: 503');

  expect(error).toMatchObject({
    name: 'DecisionRequestError',
    reason: 'http-status',
    requestBytes: 512,
    message: 'Decision request failed: 503',
  });
});

test('it is an Error, so a caller that catches any error reads its message', () => {
  const error = new DecisionRequestError('network', 64, 'Decision request failed');

  expect(error).toBeInstanceOf(Error);
});

test('it keeps the cause it was given', () => {
  const cause = new TypeError('fetch failed');
  const error = new DecisionRequestError('network', 64, 'Decision request failed', { cause });

  expect(error.cause).toBe(cause);
});

test('it has no cause when it was given none', () => {
  const error = new DecisionRequestError('aborted', 64, 'Decision request aborted');

  expect(Object.hasOwn(error, 'cause')).toBe(false);
});
