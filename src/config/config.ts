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
}

export const DEFAULT_CONFIG: Config = {
  provider: {
    baseURL: 'https://api.meta.ai',
    model: 'muse-spark-1.3-contributor',
    apiKeyEnv: 'META_API_KEY',
    reasoning: true,

    // Measured against the real 7k-token policy, not a one-line prompt: Spark
    // spends 1,000-1,900 tokens thinking before it answers, and a 2,000 cap
    // truncated the answer away. A hard case takes 13-24s on a cold cache.
    maxTokens: 3000,
    timeoutMs: 45_000,
  },
  transcriptEntries: 40,
  onFailure: 'defer',
};

export const PRESETS: Readonly<Record<string, ProviderConfig>> = {
  spark: DEFAULT_CONFIG.provider,
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
});

export async function loadConfig(path = resolveConfigPath()): Promise<Config> {
  let raw: string;

  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return DEFAULT_CONFIG;
  }

  let json: unknown;

  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${path} is not valid JSON`, { cause: error });
  }

  const parsed = configFileSchema.safeParse(json);

  if (!parsed.success) {
    throw new Error(`${path} is not a valid config: ${z.prettifyError(parsed.error)}`);
  }

  return merge(parsed.data, path);
}

type ConfigFile = z.infer<typeof configFileSchema>;

function merge(file: Readonly<ConfigFile>, path: string): Config {
  const preset = file.preset === undefined ? DEFAULT_CONFIG.provider : PRESETS[file.preset];

  if (preset === undefined) {
    throw new Error(
      `${path} names an unknown preset '${file.preset}'; known presets are ${Object.keys(PRESETS).join(', ')}`,
    );
  }

  const override = file.provider ?? {};

  return {
    provider: {
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
