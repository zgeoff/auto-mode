import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { DEFAULT_CONFIG, PRESETS, loadConfig, resolveApiKey } from './config.ts';
import { normalizeConfigFile } from './normalize-config-file.ts';

const KEY_ENV = 'AUTO_MODE_TEST_KEY';

async function setupTest(): Promise<{ readonly configFile: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-config-'));

  onTestFinished(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  return { configFile: join(dir, 'config.json') };
}

test('it falls back to the shipped defaults when there is no config file', async () => {
  const config = await loadConfig('/nowhere/config.json');

  expect(config).toStrictEqual(DEFAULT_CONFIG);
});

test('it ships Jev as the default', () => {
  expect(DEFAULT_CONFIG.provider.model).toBe('jev-1.13.0');
  expect(DEFAULT_CONFIG.provider.protocol).toBe('system-one');
  expect(DEFAULT_CONFIG.provider.reasoning).toBe(false);
  expect(DEFAULT_CONFIG.onFailure).toBe('defer');
});

// Spark returns nothing at all below roughly this budget, so the number is a
// floor rather than a preference.
test('it budgets enough output tokens for Spark to finish reasoning', () => {
  expect(PRESETS['spark']?.maxTokens).toBeGreaterThanOrEqual(3000);
});

test('it takes a preset and lets one field be overridden', async () => {
  const ctx = await setupTest();

  const glm = PRESETS['glm'];

  invariant(glm, 'the glm preset is defined');

  await writeFile(
    ctx.configFile,
    JSON.stringify({ preset: 'glm', provider: { timeoutMs: 45_000 } }),
  );

  const config = await loadConfig(ctx.configFile);

  expect(config.provider.model).toBe(glm.model);
  expect(config.provider.baseURL).toBe(glm.baseURL);
  expect(config.provider.timeoutMs).toBe(45_000);
});

const BROKEN_CONFIGS: [string, string][] = [
  ['not JSON', 'oops {'],
  ['not an object', '[]'],
  ['an unknown preset', JSON.stringify({ preset: 'gpt' })],
];

// A broken config must not quietly run a policy the user did not write.
test.each(BROKEN_CONFIGS)('it refuses a config that is %s', async (_label, body) => {
  const ctx = await setupTest();

  await writeFile(ctx.configFile, body);

  await expect(loadConfig(ctx.configFile)).toReject();
});

test('it names the known presets when the config asks for one that is not', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.configFile, JSON.stringify({ preset: 'gpt' }));

  const failure = await loadConfig(ctx.configFile).catch((error: unknown) => error);

  invariant(failure instanceof Error, 'an unknown preset rejects with an Error');

  expect(failure.message).toInclude('jev, spark, claude, glm');
});

test('it reads the API key from the environment variable first', async () => {
  process.env[KEY_ENV] = 'from-env';

  onTestFinished(() => {
    delete process.env[KEY_ENV];
  });

  const key = await resolveApiKey({ ...DEFAULT_CONFIG.provider, apiKeyEnv: KEY_ENV });

  expect(key).toBe('from-env');
});

test('it falls back to the key command when the variable is unset', async () => {
  const key = await resolveApiKey({
    ...DEFAULT_CONFIG.provider,
    apiKeyEnv: KEY_ENV,
    apiKeyCommand: 'printf from-command',
  });

  expect(key).toBe('from-command');
});

test('it reports no key when neither the variable nor a command is set', async () => {
  const key = await resolveApiKey({ ...DEFAULT_CONFIG.provider, apiKeyEnv: KEY_ENV });

  expect(key).toBeNull();
});

test('it reports no key when the key command fails', async () => {
  const key = await resolveApiKey({
    ...DEFAULT_CONFIG.provider,
    apiKeyEnv: KEY_ENV,
    apiKeyCommand: 'exit 1',
  });

  expect(key).toBeNull();
});

test('it preserves the Messages route for an unmarked custom provider during upgrade', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.configFile,
    JSON.stringify({
      provider: {
        baseURL: 'https://custom.example',
        model: 'custom-model',
        apiKeyEnv: 'CUSTOM_MODEL_KEY',
      },
    }),
  );

  const config = await loadConfig(ctx.configFile);

  expect(config.provider).toStrictEqual({
    protocol: 'messages',
    baseURL: 'https://custom.example',
    model: 'custom-model',
    apiKeyEnv: 'CUSTOM_MODEL_KEY',
    apiKeyCommand: undefined,
    reasoning: true,
    maxTokens: 3000,
    timeoutMs: 45_000,
  });
});

test('it preserves legacy key-only provider overrides', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.configFile,
    JSON.stringify({ provider: { apiKeyCommand: 'printf test-key' } }),
  );

  const config = await loadConfig(ctx.configFile);

  expect(config.provider.protocol).toBe('messages');
  expect(config.provider.model).toBe('muse-spark-1.3-contributor');
});

test('it uses Jev for an explicitly marked custom decision provider', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.configFile,
    JSON.stringify({ provider: { protocol: 'system-one', baseURL: 'https://decision.example' } }),
  );

  const config = await loadConfig(ctx.configFile);

  expect(config.provider.protocol).toBe('system-one');
  expect(config.provider.model).toBe('jev-1.13.0');
});

const LEGACY_CONFIGS: [string, Record<string, unknown>][] = [
  ['a preset with one override', { preset: 'glm', provider: { timeoutMs: 45_000 } }],
  [
    'an unmarked custom provider',
    { provider: { baseURL: 'https://custom.example', model: 'custom-model', apiKeyEnv: 'K' } },
  ],
  ['a key-only provider override', { provider: { apiKeyCommand: 'printf test-key' } }],
  [
    'a marked custom decision provider',
    { provider: { protocol: 'system-one', baseURL: 'https://decision.example' } },
  ],
  [
    'a protocol that contradicts its preset',
    { preset: 'claude', provider: { protocol: 'system-one' } },
  ],
  ['Jev over the Messages protocol', { preset: 'jev', provider: { protocol: 'messages' } }],
  [
    'every top-level field',
    {
      preset: 'jev',
      classifierPath: '/policy/decision.md',
      rulesPath: '/policy/rules.md',
      onFailure: 'deny',
      claudeSettingsPath: null,
      minConfidence: 0.9,
      transcriptEntries: 4,
    },
  ],
  ['only a settings path', { claudeSettingsPath: '/claude/settings.json' }],
];

test.each(LEGACY_CONFIGS)(
  'it loads %s in the old shape with a warning and resolves it as its migration does',
  async (_label, legacy) => {
    const ctx = await setupTest();

    await writeFile(ctx.configFile, JSON.stringify(legacy));

    const { warnings: legacyWarnings, ...fromLegacy } = await loadConfig(ctx.configFile);

    const migrated = normalizeConfigFile(legacy, ctx.configFile);

    await writeFile(ctx.configFile, JSON.stringify(migrated.file));

    const { warnings, ...fromMigrated } = await loadConfig(ctx.configFile);

    expect(fromLegacy).toStrictEqual(fromMigrated);
    expect(warnings).toStrictEqual([]);
    expect(legacyWarnings?.[0]).toInclude('run `auto-mode config migrate`');
  },
);

test('it resolves the decision classifier from the registry by id', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.configFile,
    JSON.stringify({
      classifiers: {
        jev: { apiKeyEnv: 'TYPESAFE_API_KEY' },
        haiku: {
          kind: 'messages',
          model: 'claude-haiku-4-5-20251001',
          apiKeyEnv: 'ANTHROPIC_API_KEY',
        },
      },
      decision: { classifier: 'haiku', judge: 'jev' },
    }),
  );

  const config = await loadConfig(ctx.configFile);

  expect(config.provider).toStrictEqual({
    protocol: 'messages',
    baseURL: 'https://api.anthropic.com',
    model: 'claude-haiku-4-5-20251001',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    apiKeyCommand: undefined,
    reasoning: true,
    maxTokens: 3000,
    timeoutMs: 45_000,
  });

  expect(config.judge).toStrictEqual({ ...DEFAULT_CONFIG.provider, apiKeyCommand: undefined });
  expect(config.warnings).toStrictEqual([]);
});

test('it falls back to a built-in kind when the registry has no entry for the role', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.configFile, JSON.stringify({ decision: { classifier: 'glm' } }));

  const config = await loadConfig(ctx.configFile);

  expect(config.provider.model).toBe('glm-5.3-flash');
  expect(config.judge).toBeNull();
});

test('it drops a bad registry entry with one diagnostic line and loads the others', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.configFile,
    JSON.stringify({
      classifiers: {
        jev: { timeoutMs: 4000 },
        typo: { kind: 'gpt' },
        stray: { model: 'm', maxToken: 10 },
        literal: { kind: 'claude', apiKey: 'sk-private-test-value' },
        bare: { kind: 'messages' },
      },
      scopeSources: {
        cwd: {},
        scratch: { kind: 'globs', paths: ['~/scratch/**'] },
        empty: { kind: 'globs' },
        nowhere: {},
      },
    }),
  );

  const config = await loadConfig(ctx.configFile);

  expect(config.provider.timeoutMs).toBe(4000);

  expect(config.scopeSources).toStrictEqual({
    cwd: { kind: 'cwd' },
    scratch: { kind: 'globs', paths: ['~/scratch/**'] },
  });

  expect(config.warnings).toStrictEqual([
    `${ctx.configFile}: classifiers.typo dropped: unknown kind 'gpt'; known kinds are jev, spark, claude, glm, messages`,
    `${ctx.configFile}: classifiers.stray dropped: Unrecognized key: "maxToken"`,
    `${ctx.configFile}: classifiers.literal dropped: holds a literal apiKey; name the key with apiKeyEnv or apiKeyCommand`,
    `${ctx.configFile}: classifiers.bare dropped: kind 'messages' needs a model`,
    `${ctx.configFile}: scopeSources.empty dropped: kind 'globs' needs paths`,
    `${ctx.configFile}: scopeSources.nowhere dropped: unknown kind 'nowhere'; known kinds are cwd, session, globs, atc`,
  ]);
});

test('it refuses a decision role that names a dropped entry', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.configFile,
    JSON.stringify({ classifiers: { mine: { kind: 'gpt' } }, decision: { classifier: 'mine' } }),
  );

  const failure = await loadConfig(ctx.configFile).catch((error: unknown) => error);

  invariant(failure instanceof Error, 'a dropped role entry rejects with an Error');

  expect(failure.message).toInclude("decision.classifier names 'mine', whose entry was dropped");
});

test('it refuses a decision role that names no entry and no built-in kind', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.configFile, JSON.stringify({ decision: { judge: 'nobody' } }));

  const failure = await loadConfig(ctx.configFile).catch((error: unknown) => error);

  invariant(failure instanceof Error, 'an unknown role id rejects with an Error');

  expect(failure.message).toInclude("decision.judge names 'nobody'");
});

test('it refuses a file that mixes the old keys with the new ones', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.configFile,
    JSON.stringify({ preset: 'jev', decision: { onFailure: 'deny' } }),
  );

  const failure = await loadConfig(ctx.configFile).catch((error: unknown) => error);

  invariant(failure instanceof Error, 'a mixed file rejects with an Error');

  expect(failure.message).toInclude('mixes the old keys (preset)');
});

test('it reads the policy block, expanding a leading tilde', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.configFile,
    JSON.stringify({
      decision: { minConfidence: 0.9, onFailure: 'deny' },
      policy: {
        rulesPath: '~/rules.md',
        frameworkPath: null,
        claudeSettingsPath: '/claude/settings.json',
      },
    }),
  );

  const config = await loadConfig(ctx.configFile);

  expect(config.rulesPath).toBe(join(homedir(), 'rules.md'));
  expect(config.classifierPath).toBeUndefined();
  expect(config.claudeSettingsPath).toBe('/claude/settings.json');
  expect(config.minConfidence).toBe(0.9);
  expect(config.onFailure).toBe('deny');
});

test('it disables the Claude rule import when the policy sets the settings path to null', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.configFile, JSON.stringify({ policy: { claudeSettingsPath: null } }));

  const config = await loadConfig(ctx.configFile);

  expect(config.claudeSettingsPath).toBeNull();
});
