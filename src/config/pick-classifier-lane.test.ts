import { expect, test } from 'bun:test';
import { buildMockProviderConfig } from '../../test-utils/factories/build-mock-provider-config.ts';
import { pickClassifierLane } from './pick-classifier-lane.ts';

test.each([
  ['system-one', { kind: 'jev' }],
  ['messages', { kind: 'refused', protocol: 'messages' }],
  ['claude-code', { kind: 'refused', protocol: 'claude-code' }],
] as const)('it picks the classifier lane for the %s protocol', (protocol, expected) => {
  expect(pickClassifierLane(buildMockProviderConfig({ protocol }))).toStrictEqual(expected);
});

test('it refuses a provider that names no protocol as a Messages API one', () => {
  expect(
    pickClassifierLane({
      baseURL: 'https://gateway.test',
      model: 'claude-haiku-5-5',
      reasoning: false,
      maxTokens: 3000,
      timeoutMs: 5000,
    }),
  ).toStrictEqual({ kind: 'refused', protocol: 'messages' });
});
