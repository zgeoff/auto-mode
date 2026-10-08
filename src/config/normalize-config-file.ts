import * as z from 'zod';
import type { ProviderConfig } from './config.ts';
import { MESSAGES_DEFAULTS, PRESETS, findPreset } from './presets.ts';

export interface NormalizedConfigFile {
  readonly file: unknown;
  readonly isLegacy: boolean;
  readonly warnings: readonly string[];
}

export function normalizeConfigFile(json: unknown, path: string): NormalizedConfigFile {
  if (!isRecord(json)) {
    return { file: json, isLegacy: false, warnings: [] };
  }

  const legacyKeys = Object.keys(json).filter((key) => LEGACY_KEYS.has(key));

  if (legacyKeys.length === 0) {
    return { file: json, isLegacy: false, warnings: [] };
  }

  const currentKeys = Object.keys(json).filter((key) => !LEGACY_KEYS.has(key));

  if (currentKeys.length > 0) {
    throw new Error(
      `${path} mixes the old keys (${legacyKeys.join(', ')}) with the new ones (${currentKeys.join(', ')}); run \`auto-mode config migrate\` on a copy without the new keys`,
    );
  }

  const parsed = legacyConfigSchema.safeParse(json);

  if (!parsed.success) {
    throw new Error(`${path} is not a valid config: ${z.prettifyError(parsed.error)}`);
  }

  const legacy = parsed.data;

  const warnings = [
    `${path} uses the old config keys (${legacyKeys.join(', ')}); run \`auto-mode config migrate\` to rewrite it`,
    ...(legacy.transcriptEntries === undefined
      ? []
      : [`${path} sets transcriptEntries, which has no effect; migration drops it`]),
  ];

  return { file: buildFileFromLegacy(legacy, path), isLegacy: true, warnings };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const LEGACY_KEYS: ReadonlySet<string> = new Set([
  'preset',
  'provider',
  'classifierPath',
  'rulesPath',
  'transcriptEntries',
  'onFailure',
  'claudeSettingsPath',
  'minConfidence',
]);

const text = z.string().min(1);
const positive = z.number().positive();

const legacyConfigSchema = z.strictObject({
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

type LegacyConfig = z.infer<typeof legacyConfigSchema>;

function buildFileFromLegacy(legacy: Readonly<LegacyConfig>, path: string): unknown {
  const hasClassifier = legacy.preset !== undefined || legacy.provider !== undefined;

  const decision = {
    ...(hasClassifier ? { classifier: getLegacyClassifierID(legacy) } : {}),
    ...(legacy.minConfidence === undefined ? {} : { minConfidence: legacy.minConfidence }),
    ...(legacy.onFailure === undefined ? {} : { onFailure: legacy.onFailure }),
  };

  const policy = {
    ...(legacy.rulesPath === undefined ? {} : { rulesPath: legacy.rulesPath }),
    ...(legacy.classifierPath === undefined ? {} : { frameworkPath: legacy.classifierPath }),
    ...(legacy.claudeSettingsPath === undefined
      ? {}
      : { claudeSettingsPath: legacy.claudeSettingsPath }),
  };

  return {
    ...(hasClassifier
      ? {
          classifiers: {
            [getLegacyClassifierID(legacy)]: buildClassifierEntry(
              getLegacyClassifierID(legacy),
              buildLegacyProvider(legacy, path),
            ),
          },
        }
      : {}),
    ...(Object.keys(decision).length === 0 ? {} : { decision }),
    ...(Object.keys(policy).length === 0 ? {} : { policy }),
  };
}

// A provider block with no preset and no system-one protocol has always run on
// the Spark defaults; the id keeps that visible after migration.
function getLegacyClassifierID(legacy: Readonly<LegacyConfig>): string {
  if (legacy.preset !== undefined) {
    return legacy.preset;
  }

  return legacy.provider !== undefined && legacy.provider.protocol !== 'system-one'
    ? 'spark'
    : 'jev';
}

function buildLegacyProvider(legacy: Readonly<LegacyConfig>, path: string): ProviderConfig {
  const preset = findPreset(getLegacyClassifierID(legacy));

  if (preset === undefined) {
    throw new Error(
      `${path} names an unknown preset '${legacy.preset}'; known presets are ${Object.keys(PRESETS).join(', ')}`,
    );
  }

  const override = legacy.provider ?? {};

  return {
    protocol: override.protocol ?? preset.protocol ?? 'messages',
    baseURL: override.baseURL ?? preset.baseURL,
    model: override.model ?? preset.model,
    apiKeyEnv: override.apiKeyEnv ?? preset.apiKeyEnv,
    apiKeyCommand: override.apiKeyCommand ?? preset.apiKeyCommand,
    reasoning: override.reasoning ?? preset.reasoning,
    maxTokens: override.maxTokens ?? preset.maxTokens,
    timeoutMs: override.timeoutMs ?? preset.timeoutMs,
  };
}

const PROVIDER_FIELDS = [
  'baseURL',
  'model',
  'apiKeyEnv',
  'apiKeyCommand',
  'reasoning',
  'maxTokens',
  'timeoutMs',
] as const;

// An entry keeps only what differs from its kind, so a migrated file stays as
// short as the one the user wrote. A protocol override that contradicts the
// preset becomes the generic kind for that protocol.
function buildClassifierEntry(id: string, provider: Readonly<ProviderConfig>): unknown {
  const kind = pickEntryKind(id, provider);

  const base: Partial<ProviderConfig> =
    kind === 'messages' ? MESSAGES_DEFAULTS : (findPreset(kind) ?? {});

  const fields = Object.fromEntries(
    PROVIDER_FIELDS.filter(
      (field) => provider[field] !== undefined && provider[field] !== base[field],
    ).map((field) => [field, provider[field]]),
  );

  return { ...(kind === id ? {} : { kind }), ...fields };
}

function pickEntryKind(id: string, provider: Readonly<ProviderConfig>): string {
  const preset = findPreset(id);

  if (preset !== undefined && (preset.protocol ?? 'messages') === provider.protocol) {
    return id;
  }

  return provider.protocol === 'system-one' ? 'jev' : 'messages';
}
