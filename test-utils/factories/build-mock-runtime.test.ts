import { expect, test } from 'bun:test';
import { DECISION_URL } from '../../mocks/handlers.ts';
import { buildMockRuntime } from './build-mock-runtime.ts';

test('it builds a mock host whose home does not exist', () => {
  expect(buildMockRuntime().host).toStrictEqual({
    env: {},
    home: expect.toStartWith('/nonexistent/'),
  });
});

test('it builds the host from the host fields it is given', () => {
  expect(
    buildMockRuntime({ env: { XDG_STATE_HOME: '/work/state' }, home: '/work/home' }).host,
  ).toStrictEqual({ env: { XDG_STATE_HOME: '/work/state' }, home: '/work/home' });
});

test('it reads the wall clock by default', () => {
  expect(buildMockRuntime().now).toBe(Date.now);
});

test('it keeps a clock it is given', () => {
  const now = Date.now;

  expect(buildMockRuntime({ now }).now).toBe(now);
});

test('it starts a real timer signal by default', () => {
  expect(buildMockRuntime().timeout(60_000).aborted).toBe(false);
});

test('it reaches the decision handler through the real fetch', async () => {
  const response = await buildMockRuntime().fetch(DECISION_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'jev', state: {}, questions: { rule_0: { type: 'choice' } } }),
  });

  expect(response.status).toBe(200);
});

test('it finds no checkout above the filesystem root with the real lookup', async () => {
  const checkout = await buildMockRuntime().findCheckout('/', {});

  expect(checkout).toBeNull();
});
