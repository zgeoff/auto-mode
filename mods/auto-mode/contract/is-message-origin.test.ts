import { expect, test } from 'bun:test';
import { isMessageOrigin } from './is-message-origin.ts';

test.each(['composer', 'bridge', 'sdk'])('it accepts %s as a direct message origin', (origin) => {
  expect(isMessageOrigin(origin)).toBe(true);
});

test.each(['plugin', 'agent.spawn', ''])('it rejects %p as a direct message origin', (origin) => {
  expect(isMessageOrigin(origin)).toBe(false);
});
