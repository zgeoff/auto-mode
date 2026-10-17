import { expect, test } from 'bun:test';
import { DECISION_URL } from '../../mocks/handlers.ts';
import { readRuntime } from './read-runtime.ts';

test('it reads the process environment and home, with /tmp and the standard streams as scratch space', () => {
  expect(readRuntime().host).toStrictEqual({
    env: process.env,
    home: expect.toStartWith('/'),
    scratchPaths: ['/tmp', '/dev/null', '/dev/stdout', '/dev/stderr'],
  });
});

test('it reads the wall clock', () => {
  expect(readRuntime().now).toBe(Date.now);
});

test('it starts a timer signal that has not fired yet', () => {
  expect(readRuntime().timeout(60_000).aborted).toBe(false);
});

test('it sends requests through the real fetch', async () => {
  const response = await readRuntime().fetch(DECISION_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'jev', state: {}, questions: { rule_0: { type: 'choice' } } }),
  });

  expect(response.status).toBe(200);
});

test('it finds no checkout above the filesystem root', async () => {
  const checkout = await readRuntime().findCheckout('/', {});

  expect(checkout).toBeNull();
});
