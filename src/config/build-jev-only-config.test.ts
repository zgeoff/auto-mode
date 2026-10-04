import { expect, test } from 'bun:test';
import { buildJevOnlyConfig } from './build-jev-only-config.ts';
import { DEFAULT_CONFIG } from './config.ts';

test('it rejects a traditional judge instead of changing its protocol', () => {
  expect(
    buildJevOnlyConfig({
      ...DEFAULT_CONFIG,
      provider: { ...DEFAULT_CONFIG.provider, protocol: 'messages', timeoutMs: 45_000 },
    }),
  ).toBeNull();
});

test.each([2000, 5000, 45_000])(
  'it caps a %d ms Jev timeout without changing policy or failure behavior',
  (timeoutMs) => {
    const config = {
      ...DEFAULT_CONFIG,
      rulesPath: '/repo/custom-rules.md',
      classifierPath: '/repo/decision.md',
      claudeSettingsPath: '/repo/settings.json',
      onFailure: 'deny' as const,
      minConfidence: 0.9,
      provider: { ...DEFAULT_CONFIG.provider, timeoutMs, apiKeyCommand: 'private-key-helper' },
    };

    const result = buildJevOnlyConfig(config);

    expect(result).toStrictEqual({
      ...config,
      provider: { ...config.provider, timeoutMs: Math.min(timeoutMs, 5000) },
    });

    expect(config.provider.timeoutMs).toBe(timeoutMs);
  },
);
