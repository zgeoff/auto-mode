import { expect, test } from 'bun:test';
import { DECISION_URL } from '../../mocks/handlers.ts';
import { buildMockRuntime } from './build-mock-runtime.ts';

test('it builds a runtime with a mock host and the real clock, timers, fetch and checkout lookup', () => {
  expect(buildMockRuntime()).toStrictEqual({
    host: { env: {}, home: expect.toStartWith('/nonexistent/') },
    now: Date.now,
    timeout: expect.any(Function),
    fetch: expect.any(Function),
    findCheckout: expect.any(Function),
  });
});

test('it builds the host from the host fields and keeps the other overrides', () => {
  expect(
    buildMockRuntime({ env: { XDG_STATE_HOME: '/work/state' }, home: '/work/home', now: Date.now }),
  ).toStrictEqual({
    host: { env: { XDG_STATE_HOME: '/work/state' }, home: '/work/home' },
    now: Date.now,
    timeout: expect.any(Function),
    fetch: expect.any(Function),
    findCheckout: expect.any(Function),
  });
});

test('it reaches the decision handler through the real fetch', async () => {
  const response = await buildMockRuntime().fetch(DECISION_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'jev', state: {}, questions: { rule_0: { type: 'choice' } } }),
  });

  expect(response.status).toBe(200);
});
