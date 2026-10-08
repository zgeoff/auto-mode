import { expect, test } from 'bun:test';
import { buildMockConfig } from '../../test-utils/factories/build-mock-config.ts';
import { buildJevOnlyConfig } from './build-jev-only-config.ts';

test('it refuses a Messages API classifier instead of changing its protocol', () => {
  expect(
    buildJevOnlyConfig(buildMockConfig({ provider: { protocol: 'messages', timeoutMs: 45_000 } })),
  ).toBeNull();
});

test.each([
  [2000, 2000],
  [5000, 5000],
  [45_000, 5000],
])(
  'it limits a %d ms Jev timeout to %d ms without changing policy or failure behavior',
  (timeoutMs, expected) => {
    const config = buildMockConfig({
      rulesPath: '/repo/custom-rules.md',
      classifierPath: '/repo/decision.md',
      claudeSettingsPath: '/repo/settings.json',
      onFailure: 'deny',
      minConfidence: 0.9,
      provider: { protocol: 'system-one', timeoutMs, apiKeyCommand: 'private-key-helper' },
    });

    expect(buildJevOnlyConfig(config)).toStrictEqual({
      ...config,
      provider: { ...config.provider, timeoutMs: expected },
    });
  },
);

test('it leaves the configuration it was given unchanged', () => {
  const config = buildMockConfig({ provider: { protocol: 'system-one', timeoutMs: 45_000 } });

  buildJevOnlyConfig(config);

  expect(config.provider.timeoutMs).toBe(45_000);
});
