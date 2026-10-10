import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { MESSAGES_DEFAULTS, PRESETS, findPreset } from './presets.ts';

// Spark returns nothing at all below roughly this budget, so the number is a
// minimum rather than a preference.
test('#PRESETS budgets enough output tokens for Spark to finish reasoning', () => {
  const spark = PRESETS['spark'];

  invariant(spark, 'the spark preset is defined');

  expect(spark.maxTokens).toBeGreaterThanOrEqual(3000);
});

test('#PRESETS offers the jev, spark, claude, and glm kinds', () => {
  expect(PRESETS).toContainAllKeys(['jev', 'spark', 'claude', 'glm']);
});

test('#MESSAGES_DEFAULTS names no model for the generic Messages API kind', () => {
  expect(MESSAGES_DEFAULTS).toStrictEqual({
    protocol: 'messages',
    baseURL: 'https://api.anthropic.com',
    reasoning: true,
    maxTokens: 3000,
    timeoutMs: 45_000,
  });
});

test('#PRESETS sends every kind but jev over the Messages protocol', () => {
  expect(Object.values(PRESETS).map((preset) => preset.protocol)).toStrictEqual([
    'system-one',
    'messages',
    'messages',
    'messages',
  ]);
});

test('#findPreset finds a built-in kind by its id', () => {
  expect(findPreset('jev')).toStrictEqual({
    protocol: 'system-one',
    baseURL: 'https://api.typesafe.ai',
    model: 'jev-1.13.0',
    apiKeyEnv: 'TYPESAFE_API_KEY',
    reasoning: false,
    maxTokens: 3000,
    timeoutMs: 5000,
  });
});

test('#findPreset finds no kind for a name only an inherited property matches', () => {
  expect(findPreset('constructor')).toBeUndefined();
});
