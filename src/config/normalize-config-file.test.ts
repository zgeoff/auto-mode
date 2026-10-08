import { expect, test } from 'bun:test';
import { normalizeConfigFile } from './normalize-config-file.ts';

test('it rewrites every old key into the registry shape', () => {
  const normalized = normalizeConfigFile(
    {
      preset: 'glm',
      provider: { timeoutMs: 45_000, apiKeyCommand: 'op read op://vault/item/credential' },
      classifierPath: '/policy/decision.md',
      rulesPath: '/policy/rules.md',
      onFailure: 'deny',
      claudeSettingsPath: null,
      minConfidence: 0.9,
      transcriptEntries: 4,
    },
    'config.json',
  );

  expect(normalized).toStrictEqual({
    file: {
      classifiers: {
        glm: { apiKeyCommand: 'op read op://vault/item/credential', timeoutMs: 45_000 },
      },
      decision: { classifier: 'glm', minConfidence: 0.9, onFailure: 'deny' },
      policy: {
        rulesPath: '/policy/rules.md',
        frameworkPath: '/policy/decision.md',
        claudeSettingsPath: null,
      },
    },
    isLegacy: true,
    warnings: [
      'config.json uses the old config keys (preset, provider, classifierPath, rulesPath, onFailure, claudeSettingsPath, minConfidence, transcriptEntries); run `auto-mode config migrate` to rewrite it',
      'config.json sets transcriptEntries, which has no effect; migration drops it',
    ],
  });
});

test('it names an unmarked custom provider spark, the defaults it has always run on', () => {
  const normalized = normalizeConfigFile(
    { provider: { baseURL: 'https://custom.example', model: 'custom-model' } },
    'config.json',
  );

  expect(normalized.file).toStrictEqual({
    classifiers: { spark: { baseURL: 'https://custom.example', model: 'custom-model' } },
    decision: { classifier: 'spark' },
  });
});

test('it gives a preset whose protocol was overridden the generic kind for that protocol', () => {
  const normalized = normalizeConfigFile(
    { preset: 'jev', provider: { protocol: 'messages' } },
    'config.json',
  );

  expect(normalized.file).toStrictEqual({
    classifiers: {
      jev: {
        kind: 'messages',
        baseURL: 'https://api.typesafe.ai',
        model: 'jev-1.13.0',
        apiKeyEnv: 'TYPESAFE_API_KEY',
        reasoning: false,
        timeoutMs: 5000,
      },
    },
    decision: { classifier: 'jev' },
  });
});

test('it passes a file in the current shape through untouched', () => {
  const file = { decision: { classifier: 'jev' } };

  expect(normalizeConfigFile(file, 'config.json')).toStrictEqual({
    file,
    isLegacy: false,
    warnings: [],
  });
});

test('it refuses an old-shape file with a key the old shape never had', () => {
  expect(() => normalizeConfigFile({ preset: 'jev', maxTokens: 10 }, 'config.json')).toThrow(
    'mixes the old keys (preset) with the new ones (maxTokens)',
  );
});

test('it refuses an unknown preset and names the known ones', () => {
  expect(() => normalizeConfigFile({ preset: 'gpt' }, 'config.json')).toThrow(
    'known presets are jev, spark, claude, glm',
  );
});
