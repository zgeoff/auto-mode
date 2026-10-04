import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import * as z from 'zod';

// @types/node declares execFile as returning a ChildProcess while promisify's
// signature expects a void-returning callback form; the mismatch is in the
// declaration, not the call.
// oxlint-disable-next-line typescript/strict-void-return
const run = promisify(execFile);

export interface ProviderConfig {
  readonly protocol?: 'messages' | 'system-one';
  readonly baseURL: string;
  readonly model: string;
  readonly apiKeyEnv?: string | undefined;
  readonly apiKeyCommand?: string | undefined;
  readonly reasoning: boolean;
  readonly maxTokens: number;
  readonly timeoutMs: number;
}

export interface Config {
  readonly provider: ProviderConfig;
  readonly classifierPath?: string | undefined;
  readonly rulesPath?: string | undefined;
  readonly transcriptEntries: number;
  readonly onFailure: 'defer' | 'deny';
  readonly claudeSettingsPath?: string | null | undefined;
  readonly minConfidence?: number | undefined;
}

export const DEFAULT_CONFIG: Config = {
  provider: {
    protocol: 'system-one',
    baseURL: 'https://api.typesafe.ai',
    model: 'jev-1.13.0',
    apiKeyEnv: 'TYPESAFE_API_KEY',
    reasoning: false,
    maxTokens: 3000,
    timeoutMs: 5000,
  },
  transcriptEntries: 40,
  onFailure: 'defer',
  minConfidence: 0.8,
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
  jev: DEFAULT_CONFIG.provider,
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

export function resolveConfigPath(): string {
  const xdg = process.env['XDG_CONFIG_HOME'];
  const base = xdg !== undefined && xdg !== '' ? xdg : join(homedir(), '.config');

  return join(base, 'auto-mode', 'config.json');
}

const text = z.string().min(1);
const positive = z.number().positive();

// Strict, so a key in the wrong place — maxTokens at the top level rather than
// under provider — is reported instead of silently ignored.
const configFileSchema = z.strictObject({
  preset: text.optional(),
  provider: z
    .strictObject({
      protocol: z.enum(['messages', 'system-one']).optional(),
      baseURL: text.optional(),
      model: text.optional(),
      apiKeyEnv: text.optional(),
      apiKeyCommand: text.optional(),
      reasoning: z.boolean().optional(),
      maxTokens: positive.optional(),
      timeoutMs: positive.optional(),
    })
    .optional(),
  classifierPath: text.optional(),
  rulesPath: text.optional(),
  transcriptEntries: z.number().nonnegative().optional(),
  onFailure: z.enum(['defer', 'deny']).optional(),
  claudeSettingsPath: text.nullable().optional(),
  minConfidence: z.number().min(0.5).max(1).optional(),
});

export async function loadConfig(path = resolveConfigPath()): Promise<Config> {
  let raw: string;

  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return DEFAULT_CONFIG;
    }

    throw new Error('auto-mode configuration unreadable', { cause: error });
  }

  let json: unknown;

  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`${path} is not valid JSON`);
  }

  const parsed = configFileSchema.safeParse(json);

  if (!parsed.success) {
    throw new Error(`${path} is not a valid config: ${z.prettifyError(parsed.error)}`);
  }

  return merge(parsed.data, path);
}

type ConfigFile = z.infer<typeof configFileSchema>;

function merge(file: Readonly<ConfigFile>, path: string): Config {
  const implicitProvider =
    file.provider !== undefined && file.provider.protocol !== 'system-one'
      ? SPARK_PROVIDER
      : DEFAULT_CONFIG.provider;

  const preset = file.preset === undefined ? implicitProvider : PRESETS[file.preset];

  if (preset === undefined) {
    throw new Error(
      `${path} names an unknown preset '${file.preset}'; known presets are ${Object.keys(PRESETS).join(', ')}`,
    );
  }

  const override = file.provider ?? {};

  return {
    provider: {
      protocol: override.protocol ?? preset.protocol ?? 'messages',
      baseURL: override.baseURL ?? preset.baseURL,
      model: override.model ?? preset.model,
      apiKeyEnv: override.apiKeyEnv ?? preset.apiKeyEnv,
      apiKeyCommand: override.apiKeyCommand ?? preset.apiKeyCommand,
      reasoning: override.reasoning ?? preset.reasoning,
      maxTokens: override.maxTokens ?? preset.maxTokens,
      timeoutMs: override.timeoutMs ?? preset.timeoutMs,
    },
    classifierPath: file.classifierPath,
    rulesPath: file.rulesPath,
    transcriptEntries: file.transcriptEntries ?? DEFAULT_CONFIG.transcriptEntries,
    onFailure: file.onFailure ?? DEFAULT_CONFIG.onFailure,
    claudeSettingsPath: file.claudeSettingsPath,
    minConfidence: file.minConfidence ?? DEFAULT_CONFIG.minConfidence,
  };
}

export async function resolveApiKey(provider: ProviderConfig): Promise<string | null> {
  const fromEnv = provider.apiKeyEnv === undefined ? undefined : process.env[provider.apiKeyEnv];

  if (fromEnv !== undefined && fromEnv !== '') {
    return fromEnv;
  }

  if (provider.apiKeyCommand === undefined || provider.apiKeyCommand === '') {
    return null;
  }

  try {
    const result = await run('/bin/sh', ['-c', provider.apiKeyCommand], { timeout: 5000 });

    const key = result.stdout.trim();

    return key === '' ? null : key;
  } catch {
    return null;
  }
}
