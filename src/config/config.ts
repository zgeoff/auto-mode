import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as z from 'zod';
import type { DenialBudget } from '../budget/types.ts';
import { MESSAGES_DEFAULTS, PRESETS, findPreset } from './presets.ts';
import { readApiKeyFromCommand } from './read-api-key-from-command.ts';
import { readHostEnvironment } from './read-host-environment.ts';
import type { EvaluationOptions, HostEnvironment } from './types.ts';

export { PRESETS } from './presets.ts';

export interface ProviderConfig {
  readonly protocol?: 'messages' | 'system-one' | 'claude-code';
  readonly baseURL: string;
  readonly model: string;
  readonly apiKeyEnv?: string | undefined;
  readonly apiKeyCommand?: string | undefined;
  readonly reasoning: boolean;
  readonly maxTokens: number;
  readonly timeoutMs: number;
}

export interface ScopeSource {
  readonly kind: ScopeSourceKind;
  readonly paths?: readonly string[];
}

type ScopeSourceKind = (typeof SCOPE_SOURCE_KINDS)[number];

const SCOPE_SOURCE_KINDS = ['cwd', 'session', 'globs', 'atc'] as const;

export interface CaptureConfig {
  readonly enabled: boolean;
  readonly dir?: string | undefined;
}

export interface Config {
  readonly provider: ProviderConfig;
  readonly judge?: ProviderConfig | null;
  readonly scopeSources?: Readonly<Record<string, ScopeSource>>;
  readonly classifierPath?: string | undefined;
  readonly rulesPath?: string | undefined;
  readonly onFailure: 'defer' | 'deny';
  readonly claudeSettingsPath?: string | null | undefined;
  readonly blockThreshold?: number | undefined;
  readonly denialBudget?: DenialBudget;
  readonly capture?: CaptureConfig;
  readonly warnings?: readonly string[];
}

const DEFAULT_PROVIDER = findPreset('jev');
const DEFAULT_JUDGE = findPreset('claude-code');

if (DEFAULT_PROVIDER === undefined || DEFAULT_JUDGE === undefined) {
  throw new Error('the jev or claude-code preset is missing');
}

export const DEFAULT_DENIAL_BUDGET: DenialBudget = { consecutive: 3, perSession: 20 };

export const DEFAULT_SCOPE_SOURCES: Readonly<Record<string, ScopeSource>> = {
  cwd: { kind: 'cwd' },
  session: { kind: 'session' },
  atc: { kind: 'atc' },
};

export const DEFAULT_BLOCK_THRESHOLD = 0.2;

export const DEFAULT_CONFIG: Config = {
  provider: DEFAULT_PROVIDER,
  judge: DEFAULT_JUDGE,
  onFailure: 'defer',
  blockThreshold: DEFAULT_BLOCK_THRESHOLD,
  denialBudget: DEFAULT_DENIAL_BUDGET,
  scopeSources: DEFAULT_SCOPE_SOURCES,
};

export function resolveConfigPath(host: Readonly<HostEnvironment> = readHostEnvironment()): string {
  const xdg = host.env['XDG_CONFIG_HOME'];
  const base = xdg !== undefined && xdg !== '' ? xdg : join(host.home, '.config');

  return join(base, 'auto-mode', 'config.json');
}

export async function loadConfig(
  configPath?: string,
  host: Readonly<HostEnvironment> = readHostEnvironment(),
): Promise<Config> {
  const path = configPath ?? resolveConfigPath(host);
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

  return buildConfig(json, path, host.home);
}

const text = z.string().min(1);
const positive = z.number().positive();

const denialBudgetSchema = z.strictObject({
  consecutive: z.number().int().positive().optional(),
  perSession: z.number().int().positive().optional(),
});

// Registry values stay unknown here so one bad entry drops alone instead of
// failing the file; each entry is parsed on its own below.
const configFileSchema = z.strictObject({
  classifiers: z.record(text, z.unknown()).optional(),
  scopeSources: z.record(text, z.unknown()).optional(),
  decision: z
    .strictObject({
      classifier: text.optional(),
      judge: text.nullable().optional(),
      blockThreshold: z.number().gt(0).max(1).optional(),
      onFailure: z.enum(['defer', 'deny']).optional(),
      denialBudget: denialBudgetSchema.optional(),
    })
    .optional(),
  policy: z
    .strictObject({
      rulesPath: text.nullable().optional(),
      frameworkPath: text.nullable().optional(),
      claudeSettingsPath: text.nullable().optional(),
    })
    .optional(),
  capture: z
    .strictObject({
      enabled: z.boolean().optional(),
      dir: text.optional(),
    })
    .optional(),
});

function buildConfig(json: unknown, path: string, home: string): Config {
  const parsed = configFileSchema.safeParse(json);

  if (!parsed.success) {
    throw new Error(`${path} is not a valid config: ${z.prettifyError(parsed.error)}`);
  }

  const file = parsed.data;
  const warnings: string[] = [];

  const classifiers = buildRegistry(file.classifiers ?? {}, (id, entry) =>
    parseClassifierEntry(id, entry),
  );

  const scopeSources = buildRegistry(file.scopeSources ?? {}, (id, entry) =>
    parseScopeSourceEntry(id, entry, home),
  );

  const configuredSources = file.scopeSources === undefined ? null : scopeSources.entries;

  warnings.push(
    ...classifiers.dropped.map((line) => `${path}: classifiers.${line}`),
    ...scopeSources.dropped.map((line) => `${path}: scopeSources.${line}`),
    ...collectScopeWarnings(configuredSources).map((line) => `${path}: scopeSources ${line}`),
  );

  const decision = file.decision ?? {};
  const policy = file.policy ?? {};
  const judgeID = decision.judge === undefined ? 'claude-code' : decision.judge;

  const provider = resolveRole(
    'classifier',
    decision.classifier ?? 'jev',
    classifiers.entries,
    classifiers.droppedIDs,
    path,
  );

  if (provider.protocol === 'claude-code') {
    throw new Error(`${path}: decision.classifier names a claude-code kind, which only judges`);
  }

  const judge =
    judgeID === null
      ? null
      : resolveRole('judge', judgeID, classifiers.entries, classifiers.droppedIDs, path);

  if (judge?.protocol === 'system-one') {
    throw new Error(`${path}: decision.judge names a Jev kind, which cannot write a reason`);
  }

  return {
    provider,
    judge,
    scopeSources: configuredSources ?? DEFAULT_SCOPE_SOURCES,
    classifierPath: expandHomePath(policy.frameworkPath ?? undefined, home),
    rulesPath: expandHomePath(policy.rulesPath ?? undefined, home),
    onFailure: decision.onFailure ?? DEFAULT_CONFIG.onFailure,
    claudeSettingsPath:
      policy.claudeSettingsPath === null ? null : expandHomePath(policy.claudeSettingsPath, home),
    blockThreshold: decision.blockThreshold ?? DEFAULT_BLOCK_THRESHOLD,
    denialBudget: {
      consecutive: decision.denialBudget?.consecutive ?? DEFAULT_DENIAL_BUDGET.consecutive,
      perSession: decision.denialBudget?.perSession ?? DEFAULT_DENIAL_BUDGET.perSession,
    },
    ...(file.capture === undefined
      ? {}
      : {
          capture: {
            enabled: file.capture.enabled ?? false,
            dir: expandHomePath(file.capture.dir, home),
          },
        }),
    warnings,
  };
}

// A registry without the cwd source leaves the task without the worktree it
// works in, and a glob over `.worktrees` hands every task each other's
// worktrees; both are legal, so they warn rather than drop.
function collectScopeWarnings(entries: Readonly<Record<string, ScopeSource>> | null): string[] {
  if (entries === null) {
    return [];
  }

  const sources = Object.values(entries);

  return [
    ...(sources.some((source) => source.kind === 'cwd')
      ? []
      : ['has no cwd entry, so the task owns only what the other sources name']),
    ...sources
      .flatMap((source) => source.paths ?? [])
      .filter((glob) => glob.includes('.worktrees'))
      .map((glob) => `glob ${glob} covers worktrees that other tasks own`),
  ];
}

interface Registry<T> {
  readonly entries: Readonly<Record<string, T>>;
  readonly dropped: readonly string[];
  readonly droppedIDs: readonly string[];
}

function buildRegistry<T>(
  raw: Readonly<Record<string, unknown>>,
  parseEntry: (id: string, entry: unknown) => T | string,
): Registry<T> {
  const entries = new Map<string, T>();

  const dropped: string[] = [];
  const droppedIDs: string[] = [];

  for (const [id, entry] of Object.entries(raw)) {
    const result = parseEntry(id, entry);

    if (typeof result === 'string') {
      dropped.push(`${id} dropped: ${result}`);
      droppedIDs.push(id);
    } else {
      entries.set(id, result);
    }
  }

  return { entries: Object.fromEntries(entries), dropped, droppedIDs };
}

const CLASSIFIER_KINDS = [...Object.keys(PRESETS), 'messages'];

const classifierEntrySchema = z.strictObject({
  kind: text.optional(),
  baseURL: text.optional(),
  model: text.optional(),
  apiKeyEnv: text.optional(),
  apiKeyCommand: text.optional(),
  reasoning: z.boolean().optional(),
  maxTokens: positive.optional(),
  timeoutMs: positive.optional(),
});

// A credential in the file would sit in plain text beside the rest of the
// config, so only references (an env var or a command) are accepted.
const CREDENTIAL_KEYS = new Set(['apiKey', 'key', 'token', 'secret']);

type KindDefaults = Omit<ProviderConfig, 'model'> & { readonly model?: string };

function parseClassifierEntry(id: string, entry: unknown): ProviderConfig | string {
  if (typeof entry === 'object' && entry !== null) {
    const credential = Object.keys(entry).find((key) => CREDENTIAL_KEYS.has(key));

    if (credential !== undefined) {
      return `holds a literal ${credential}; name the key with apiKeyEnv or apiKeyCommand`;
    }
  }

  const parsed = classifierEntrySchema.safeParse(entry);

  if (!parsed.success) {
    return formatFirstIssue(parsed.error.issues);
  }

  const kind = parsed.data.kind ?? id;

  if (!CLASSIFIER_KINDS.includes(kind)) {
    return `unknown kind '${kind}'; known kinds are ${CLASSIFIER_KINDS.join(', ')}`;
  }

  const base: KindDefaults | undefined = kind === 'messages' ? MESSAGES_DEFAULTS : findPreset(kind);
  const model = parsed.data.model ?? base?.model;

  if (base === undefined || model === undefined) {
    return `kind '${kind}' needs a model`;
  }

  return {
    protocol: base.protocol ?? 'messages',
    baseURL: parsed.data.baseURL ?? base.baseURL,
    model,
    apiKeyEnv: parsed.data.apiKeyEnv ?? base.apiKeyEnv,
    apiKeyCommand: parsed.data.apiKeyCommand ?? base.apiKeyCommand,
    reasoning: parsed.data.reasoning ?? base.reasoning,
    maxTokens: parsed.data.maxTokens ?? base.maxTokens,
    timeoutMs: parsed.data.timeoutMs ?? base.timeoutMs,
  };
}

const scopeSourceEntrySchema = z.strictObject({
  kind: text.optional(),
  paths: z.array(text).min(1).optional(),
});

function parseScopeSourceEntry(id: string, entry: unknown, home: string): ScopeSource | string {
  const parsed = scopeSourceEntrySchema.safeParse(entry);

  if (!parsed.success) {
    return formatFirstIssue(parsed.error.issues);
  }

  const kind = SCOPE_SOURCE_KINDS.find((known) => known === (parsed.data.kind ?? id));

  if (kind === undefined) {
    return `unknown kind '${parsed.data.kind ?? id}'; known kinds are ${SCOPE_SOURCE_KINDS.join(', ')}`;
  }

  if (kind === 'globs') {
    return parsed.data.paths === undefined
      ? "kind 'globs' needs paths"
      : { kind, paths: parsed.data.paths.map((glob) => expandHomePath(glob, home) ?? glob) };
  }

  return parsed.data.paths === undefined ? { kind } : `kind '${kind}' takes no paths`;
}

interface EntryIssue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

function formatFirstIssue(issues: readonly EntryIssue[]): string {
  const [issue] = issues;

  if (issue === undefined) {
    return 'invalid entry';
  }

  return issue.path.length === 0
    ? issue.message
    : `${issue.path.map(String).join('.')}: ${issue.message}`;
}

function resolveRole(
  role: string,
  id: string,
  entries: Readonly<Record<string, ProviderConfig>>,
  droppedIDs: readonly string[],
  path: string,
): ProviderConfig {
  const entry = Object.hasOwn(entries, id) ? entries[id] : undefined;

  if (entry !== undefined) {
    return entry;
  }

  if (droppedIDs.includes(id)) {
    throw new Error(`${path}: decision.${role} names '${id}', whose entry was dropped`);
  }

  if (findPreset(id) === undefined) {
    throw new Error(
      `${path}: decision.${role} names '${id}', which is neither a classifiers entry nor a built-in kind (${Object.keys(PRESETS).join(', ')})`,
    );
  }

  return parseBuiltIn(id);
}

function parseBuiltIn(id: string): ProviderConfig {
  const resolved = parseClassifierEntry(id, {});

  if (typeof resolved === 'string') {
    throw new TypeError(`built-in kind ${id} does not resolve: ${resolved}`);
  }

  return resolved;
}

function expandHomePath(path: string | undefined, home: string): string | undefined {
  return path?.startsWith('~/') === true ? join(home, path.slice(2)) : path;
}

export function resolveApiKey(
  provider: ProviderConfig,
  options: EvaluationOptions = {},
): Promise<string | null> {
  const host = options.host ?? readHostEnvironment();
  const fromEnv = provider.apiKeyEnv === undefined ? undefined : host.env[provider.apiKeyEnv];

  if (fromEnv !== undefined && fromEnv !== '') {
    return Promise.resolve(fromEnv);
  }

  if (provider.apiKeyCommand === undefined || provider.apiKeyCommand === '') {
    return Promise.resolve(null);
  }

  return readApiKeyFromCommand(provider.apiKeyCommand, { ...options, host });
}
