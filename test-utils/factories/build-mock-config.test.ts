import { expect, test } from 'bun:test';
import { buildMockConfig } from './build-mock-config.ts';

test('it builds a default config', () => {
  expect(buildMockConfig()).toStrictEqual({
    provider: {
      protocol: 'system-one',
      baseURL: 'https://decision.test',
      model: expect.toBeString(),
      apiKeyEnv: 'AUTO_MODE_UNSET_TEST_KEY',
      apiKeyCommand: undefined,
      reasoning: false,
      maxTokens: 3000,
      timeoutMs: 5000,
    },
    judge: null,
    scopeSources: { cwd: { kind: 'cwd' }, session: { kind: 'session' }, atc: { kind: 'atc' } },
    classifierPath: undefined,
    rulesPath: undefined,
    onFailure: 'defer',
    claudeSettingsPath: null,
    minConfidence: 0.8,
    denialBudget: { consecutive: 3, perSession: 20 },
    warnings: [],
  });
});

test('it applies overrides on top of the defaults', () => {
  const config = buildMockConfig({
    provider: { timeoutMs: 20 },
    judge: { protocol: 'messages', baseURL: 'https://gateway.test' },
    onFailure: 'deny',
    denialBudget: { consecutive: 1 },
  });

  expect(config).toStrictEqual({
    provider: {
      protocol: 'system-one',
      baseURL: 'https://decision.test',
      model: expect.toBeString(),
      apiKeyEnv: 'AUTO_MODE_UNSET_TEST_KEY',
      apiKeyCommand: undefined,
      reasoning: false,
      maxTokens: 3000,
      timeoutMs: 20,
    },
    judge: {
      protocol: 'messages',
      baseURL: 'https://gateway.test',
      model: expect.toBeString(),
      apiKeyEnv: 'AUTO_MODE_UNSET_TEST_KEY',
      apiKeyCommand: undefined,
      reasoning: false,
      maxTokens: 3000,
      timeoutMs: 5000,
    },
    scopeSources: { cwd: { kind: 'cwd' }, session: { kind: 'session' }, atc: { kind: 'atc' } },
    classifierPath: undefined,
    rulesPath: undefined,
    onFailure: 'deny',
    claudeSettingsPath: null,
    minConfidence: 0.8,
    denialBudget: { consecutive: 1, perSession: 20 },
    warnings: [],
  });
});
