import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * How to reach the judging model. Every supported provider speaks the Anthropic
 * Messages API, so one shape covers Claude, Muse, GLM and Kimi — only the base
 * URL, the model id and the key change.
 */
export interface ProviderConfig {
  readonly baseURL: string;
  readonly model: string;
  /** Environment variable holding the key. Tried first. */
  readonly apiKeyEnv?: string;
  /** Command that prints the key. Tried when the variable is unset or empty. */
  readonly apiKeyCommand?: string;
  /**
   * Whether this model reasons before answering. It drives three things at once
   * — how the prompt asks for the answer, how many tokens to allow, and how long
   * to wait — because a reasoning model needs more of all three.
   */
  readonly reasoning: boolean;
  readonly maxTokens: number;
  readonly timeoutMs: number;
}

export interface Config {
  readonly provider: ProviderConfig;
  readonly classifierPath?: string;
  readonly rulesPath?: string;
  /** How many transcript entries to show the model, newest last. */
  readonly transcriptEntries: number;
  /**
   * What to do when the model cannot be reached or does not answer. `defer`
   * writes nothing, so the harness asks the operator as it would without this
   * hook. `deny` fails closed.
   */
  readonly onFailure: 'defer' | 'deny';
}

/**
 * Muse Spark is the default because it reasons, it was correct on every case we
 * measured, and a contributor-tier call costs about a fortieth of the
 * alternatives. Its token budget is not a preference: below roughly 2000 it
 * returns nothing at all.
 */
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

/** Provider presets, so a config need only name one. */
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

export function configPath(): string {
  const xdg = process.env['XDG_CONFIG_HOME'];
  const base = xdg !== undefined && xdg !== '' ? xdg : join(homedir(), '.config');

  return join(base, 'auto-mode', 'config.json');
}

/**
 * Reads the config, falling back to the shipped defaults. A missing file is
 * normal. A malformed one is not, and it throws rather than silently running a
 * policy the user did not write.
 */
export async function loadConfig(path = configPath()): Promise<Config> {
  let text: string;

  try {
    text = await readFile(path, 'utf8');
  } catch {
    return DEFAULT_CONFIG;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${(error as Error).message}`);
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${path} must hold a JSON object`);
  }

  return merge(parsed as Record<string, unknown>, path);
}

function merge(raw: Record<string, unknown>, path: string): Config {
  const presetName = typeof raw['preset'] === 'string' ? raw['preset'] : undefined;

  if (presetName !== undefined && PRESETS[presetName] === undefined) {
    throw new Error(
      `${path} names an unknown preset '${presetName}'; known presets are ${Object.keys(PRESETS).join(', ')}`,
    );
  }

  const base = presetName === undefined ? DEFAULT_CONFIG.provider : (PRESETS[presetName] as ProviderConfig);
  const override = isObject(raw['provider']) ? raw['provider'] : {};

  const provider: ProviderConfig = {
    baseURL: str(override['baseURL']) ?? base.baseURL,
    model: str(override['model']) ?? base.model,
    reasoning: typeof override['reasoning'] === 'boolean' ? override['reasoning'] : base.reasoning,
    maxTokens: num(override['maxTokens']) ?? base.maxTokens,
    timeoutMs: num(override['timeoutMs']) ?? base.timeoutMs,
    ...pick('apiKeyEnv', str(override['apiKeyEnv']) ?? base.apiKeyEnv),
    ...pick('apiKeyCommand', str(override['apiKeyCommand']) ?? base.apiKeyCommand),
  };

  const onFailure = raw['onFailure'] === 'deny' ? 'deny' : 'defer';

  return {
    provider,
    transcriptEntries: num(raw['transcriptEntries']) ?? DEFAULT_CONFIG.transcriptEntries,
    onFailure,
    ...pick('classifierPath', str(raw['classifierPath'])),
    ...pick('rulesPath', str(raw['rulesPath'])),
  };
}

/** Reads the key from the environment, then from the helper command. */
export async function resolveApiKey(provider: ProviderConfig): Promise<string | null> {
  const fromEnv = provider.apiKeyEnv === undefined ? undefined : process.env[provider.apiKeyEnv];

  if (fromEnv !== undefined && fromEnv !== '') {
    return fromEnv;
  }

  if (provider.apiKeyCommand === undefined || provider.apiKeyCommand === '') {
    return null;
  }

  try {
    const { stdout } = await run('/bin/sh', ['-c', provider.apiKeyCommand], { timeout: 5000 });
    const key = stdout.trim();

    return key === '' ? null : key;
  } catch {
    return null;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function pick<K extends string>(key: K, value: string | undefined): Record<K, string> | object {
  return value === undefined ? {} : ({ [key]: value } as Record<K, string>);
}
