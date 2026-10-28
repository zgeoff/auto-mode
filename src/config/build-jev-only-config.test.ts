import { expect, test } from 'bun:test';
import { buildMockConfig } from '../../test-utils/factories/build-mock-config.ts';
import { buildJevOnlyConfig } from './build-jev-only-config.ts';

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
      blockThreshold: 0.3,
      warnings: [],
      judge: null,
      denialBudget: { consecutive: 3, perSession: 20 },
      scopeSources: {
        cwd: { kind: 'cwd' },
        session: { kind: 'session' },
        launcher: { kind: 'launcher' },
        atc: { kind: 'atc' },
      },
      provider: {
        protocol: 'system-one',
        baseURL: 'https://decision.test',
        model: 'jev-1',
        apiKeyEnv: 'JEV_KEY',
        apiKeyCommand: 'private-key-helper',
        reasoning: false,
        maxTokens: 3000,
        timeoutMs,
      },
    });

    expect(buildJevOnlyConfig(config)).toStrictEqual({
      rulesPath: '/repo/custom-rules.md',
      classifierPath: '/repo/decision.md',
      claudeSettingsPath: '/repo/settings.json',
      onFailure: 'deny',
      blockThreshold: 0.3,
      warnings: [],
      judge: null,
      denialBudget: { consecutive: 3, perSession: 20 },
      scopeSources: {
        cwd: { kind: 'cwd' },
        session: { kind: 'session' },
        launcher: { kind: 'launcher' },
        atc: { kind: 'atc' },
      },
      provider: {
        protocol: 'system-one',
        baseURL: 'https://decision.test',
        model: 'jev-1',
        apiKeyEnv: 'JEV_KEY',
        apiKeyCommand: 'private-key-helper',
        reasoning: false,
        maxTokens: 3000,
        timeoutMs: expected,
      },
    });
  },
);

test.each([
  [45_000, 45_000],
  [120_000, 120_000],
  [300_000, 120_000],
])('it limits a %d ms judge timeout to %d ms', (timeoutMs, expected) => {
  const config = buildMockConfig({
    provider: { protocol: 'system-one', timeoutMs: 5000 },
    judge: {
      protocol: 'claude-code',
      baseURL: 'https://api.anthropic.com',
      model: 'judge-1',
      reasoning: false,
      maxTokens: 3000,
      timeoutMs,
    },
  });

  expect(buildJevOnlyConfig(config).judge?.timeoutMs).toBe(expected);
});

test('it leaves the configuration it was given unchanged', () => {
  const config = buildMockConfig({ provider: { protocol: 'system-one', timeoutMs: 45_000 } });

  buildJevOnlyConfig(config);

  expect(config.provider.timeoutMs).toBe(45_000);
});
