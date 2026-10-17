import { expect, test } from 'bun:test';
import { buildMockProviderConfig } from '../../test-utils/factories/build-mock-provider-config.ts';
import { pickJudgeLane } from './pick-judge-lane.ts';

test.each([
  ['claude-code', { transport: 'agent-sdk', credential: 'none' }],
  ['messages', { transport: 'messages', credential: 'api-key' }],
  ['system-one', { transport: 'refused', credential: 'api-key' }],
] as const)('it picks the judge lane for the %s protocol', (protocol, expected) => {
  expect(pickJudgeLane(buildMockProviderConfig({ protocol }))).toStrictEqual(expected);
});

test('it reads a provider that names no protocol as a Messages API one', () => {
  expect(
    pickJudgeLane({
      baseURL: 'https://gateway.test',
      model: 'claude-haiku-5-5',
      reasoning: false,
      maxTokens: 3000,
      timeoutMs: 5000,
    }),
  ).toStrictEqual({ transport: 'messages', credential: 'api-key' });
});
