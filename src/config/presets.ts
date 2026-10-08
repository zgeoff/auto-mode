import type { ProviderConfig } from './config.ts';

const JEV_PROVIDER: ProviderConfig = {
  protocol: 'system-one',
  baseURL: 'https://api.typesafe.ai',
  model: 'jev-1.13.0',
  apiKeyEnv: 'TYPESAFE_API_KEY',
  reasoning: false,
  maxTokens: 3000,
  timeoutMs: 5000,
};

const SPARK_PROVIDER: ProviderConfig = {
  baseURL: 'https://api.meta.ai',
  model: 'muse-spark-1.3-contributor',
  apiKeyEnv: 'META_API_KEY',
  reasoning: true,

  // Measured against the real 7k-token policy, not a one-line prompt: Spark
  // spends 1,000-1,900 tokens thinking before it answers, and a 2,000 cap
  // truncated the answer away. A hard case takes 13-24s on a cold cache.
  maxTokens: 3000,
  timeoutMs: 45_000,
};

export const PRESETS: Readonly<Record<string, ProviderConfig>> = {
  jev: JEV_PROVIDER,
  spark: SPARK_PROVIDER,
  claude: {
    baseURL: 'https://api.anthropic.com',
    model: 'claude-haiku-4-5-20251001',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    reasoning: true,
    maxTokens: 3000,
    timeoutMs: 45_000,
  },
  glm: {
    baseURL: 'https://api.z.ai/api/anthropic',
    model: 'glm-5.3-flash',
    apiKeyEnv: 'ZAI_API_KEY',
    reasoning: true,

    // GLM has the worst tail of the three.
    maxTokens: 3000,
    timeoutMs: 60_000,
  },
};

// The generic Messages API kind names no model, so an entry of this kind must.
export const MESSAGES_DEFAULTS: Omit<ProviderConfig, 'model'> = {
  protocol: 'messages',
  baseURL: 'https://api.anthropic.com',
  reasoning: true,
  maxTokens: 3000,
  timeoutMs: 45_000,
};
