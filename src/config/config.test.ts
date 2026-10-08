import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { DEFAULT_CONFIG, PRESETS, loadConfig, resolveApiKey, resolveConfigPath } from './config.ts';

const KEY_ENV = 'AUTO_MODE_TEST_KEY';

async function setupTest(): Promise<{ readonly dir: string; readonly configFile: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-config-'));

  onTestFinished(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  return { dir, configFile: join(dir, 'config.json') };
}

test('it falls back to the shipped defaults when there is no config file', async () => {
  const ctx = await setupTest();
  const config = await loadConfig(ctx.configFile);

  expect(config).toStrictEqual(DEFAULT_CONFIG);
});

test('it finds the config file under the home config directory when XDG_CONFIG_HOME is unset', async () => {
  const ctx = await setupTest();

  expect(resolveConfigPath({ env: {}, home: ctx.dir })).toBe(
    join(ctx.dir, '.config', 'auto-mode', 'config.json'),
  );
});

test('it finds the config file under XDG_CONFIG_HOME when it is set', async () => {
  const ctx = await setupTest();

  expect(resolveConfigPath({ env: { XDG_CONFIG_HOME: join(ctx.dir, 'xdg') }, home: ctx.dir })).toBe(
    join(ctx.dir, 'xdg', 'auto-mode', 'config.json'),
  );
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

test('it takes a built-in kind and lets one field be overridden', async () => {
  const ctx = await setupTest();

  const glm = PRESETS['glm'];

  invariant(glm, 'the glm preset is defined');

  await writeFile(
    ctx.configFile,
    JSON.stringify({
      classifiers: { glm: { timeoutMs: 45_000 } },
      decision: { classifier: 'glm' },
    }),
  );

  const config = await loadConfig(ctx.configFile);

  expect(config.provider.model).toBe(glm.model);
  expect(config.provider.baseURL).toBe(glm.baseURL);
  expect(config.provider.timeoutMs).toBe(45_000);
});

const BROKEN_CONFIGS: [string, string][] = [
  ['not JSON', 'oops {'],
  ['not an object', '[]'],
  ['a role with no entry and no kind', JSON.stringify({ decision: { classifier: 'gpt' } })],
];

// A broken config must not quietly run a policy the user did not write.
test.each(BROKEN_CONFIGS)('it refuses a config that is %s', async (_label, body) => {
  const ctx = await setupTest();

  await writeFile(ctx.configFile, body);

  await expect(loadConfig(ctx.configFile)).toReject();
});

test('it names the built-in kinds when a role names one that is not', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.configFile, JSON.stringify({ decision: { classifier: 'gpt' } }));

  const failure = await loadConfig(ctx.configFile).catch((error: unknown) => error);

  invariant(failure instanceof Error, 'an unknown role id rejects with an Error');

  expect(failure.message).toInclude('jev, spark, claude, glm');
});

test('it reads the API key from the environment variable first', async () => {
  const ctx = await setupTest();

  const key = await resolveApiKey(
    { ...DEFAULT_CONFIG.provider, apiKeyEnv: KEY_ENV, apiKeyCommand: 'printf from-command' },
    { host: { env: { [KEY_ENV]: 'from-env' }, home: ctx.dir } },
  );

  expect(key).toBe('from-env');
});

test('it falls back to the key command when the variable is unset', async () => {
  const ctx = await setupTest();

  const key = await resolveApiKey(
    { ...DEFAULT_CONFIG.provider, apiKeyEnv: KEY_ENV, apiKeyCommand: 'printf from-command' },
    { host: { env: {}, home: ctx.dir } },
  );

  expect(key).toBe('from-command');
});

test('it runs the key command in the injected environment', async () => {
  const ctx = await setupTest();

  const key = await resolveApiKey(
    { ...DEFAULT_CONFIG.provider, apiKeyEnv: KEY_ENV, apiKeyCommand: 'printf %s "$INJECTED_KEY"' },
    { host: { env: { INJECTED_KEY: 'from-injected-env' }, home: ctx.dir } },
  );

  expect(key).toBe('from-injected-env');
});

test('it gives the key command the injected home when the injected environment has none', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'key'), 'from-home-file');

  const key = await resolveApiKey(
    { ...DEFAULT_CONFIG.provider, apiKeyEnv: KEY_ENV, apiKeyCommand: 'cat "$HOME/key"' },
    { host: { env: {}, home: ctx.dir } },
  );

  expect(key).toBe('from-home-file');
});

test('it reports no key when neither the variable nor a command is set', async () => {
  const ctx = await setupTest();

  const key = await resolveApiKey(
    { ...DEFAULT_CONFIG.provider, apiKeyEnv: KEY_ENV },
    { host: { env: {}, home: ctx.dir } },
  );

  expect(key).toBeNull();
});

test('it reports no key when the key command fails', async () => {
  const ctx = await setupTest();

  const key = await resolveApiKey(
    { ...DEFAULT_CONFIG.provider, apiKeyEnv: KEY_ENV, apiKeyCommand: 'exit 1' },
    { host: { env: {}, home: ctx.dir } },
  );

  expect(key).toBeNull();
});

test('it uses Jev for a custom entry of the jev kind', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.configFile,
    JSON.stringify({
      classifiers: { mine: { kind: 'jev', baseURL: 'https://decision.example' } },
      decision: { classifier: 'mine' },
    }),
  );

  const config = await loadConfig(ctx.configFile);

  expect(config.provider.protocol).toBe('system-one');
  expect(config.provider.baseURL).toBe('https://decision.example');
  expect(config.provider.model).toBe('jev-1.13.0');
});

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

  const config = await loadConfig(ctx.configFile, { env: {}, home: ctx.dir });

  expect(config.provider.timeoutMs).toBe(4000);

  expect(config.scopeSources).toStrictEqual({
    cwd: { kind: 'cwd' },
    scratch: { kind: 'globs', paths: [join(ctx.dir, 'scratch/**')] },
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

const OLD_KEYS: [string, unknown][] = [
  ['preset', 'jev'],
  ['provider', { apiKeyEnv: 'TYPESAFE_API_KEY' }],
  ['classifierPath', '/policy/decision.md'],
  ['rulesPath', '/policy/rules.md'],
  ['minConfidence', 0.8],
  ['onFailure', 'deny'],
  ['transcriptEntries', 4],
  ['claudeSettingsPath', null],
];

test.each(OLD_KEYS)('it refuses the old top-level key %s and names it', async (key, value) => {
  const ctx = await setupTest();

  await writeFile(ctx.configFile, JSON.stringify({ [key]: value }));

  const failure = await loadConfig(ctx.configFile).catch((error: unknown) => error);

  invariant(failure instanceof Error, 'an old key rejects with an Error');

  expect(failure.message).toInclude(`Unrecognized key: "${key}"`);
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

  const config = await loadConfig(ctx.configFile, { env: {}, home: ctx.dir });

  expect(config.rulesPath).toBe(join(ctx.dir, 'rules.md'));
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

test.each(['constructor', 'toString', '__proto__'])(
  'it refuses a decision role named %s, which only an inherited property matches',
  async (id) => {
    const ctx = await setupTest();

    await writeFile(
      ctx.configFile,
      `{"classifiers":{"${id}":{"kind":"gpt"}},"decision":{"classifier":"${id}"}}`,
    );

    const failure = await loadConfig(ctx.configFile).catch((error: unknown) => error);

    invariant(failure instanceof Error, 'an inherited name rejects with an Error');

    expect(failure.message).toInclude(`decision.classifier names '${id}'`);
  },
);

test('it loads the approved shape with no diagnostics and reads the denial budget', async () => {
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
      scopeSources: {
        cwd: {},
        session: {},
        scratch: { kind: 'globs', paths: ['~/scratch/**'] },
        atc: {},
      },
      decision: {
        classifier: 'jev',
        judge: null,
        minConfidence: 0.8,
        onFailure: 'defer',
        denialBudget: { consecutive: 5, perSession: 40 },
      },
      policy: { rulesPath: null, frameworkPath: null, claudeSettingsPath: null },
    }),
  );

  const config = await loadConfig(ctx.configFile, { env: {}, home: ctx.dir });

  expect(config.warnings).toStrictEqual([]);
  expect(config.denialBudget).toStrictEqual({ consecutive: 5, perSession: 40 });
});

test('it defaults the denial budget to 3 in a row and 20 per session', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.configFile, JSON.stringify({ decision: { denialBudget: {} } }));

  const config = await loadConfig(ctx.configFile);

  expect(config.denialBudget).toStrictEqual({ consecutive: 3, perSession: 20 });
  expect(DEFAULT_CONFIG.denialBudget).toStrictEqual({ consecutive: 3, perSession: 20 });
});

test('it runs the cwd, session, and atc sources when the file has no scope sources', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.configFile, JSON.stringify({ decision: { onFailure: 'defer' } }));

  const config = await loadConfig(ctx.configFile);

  expect(config.scopeSources).toStrictEqual({
    cwd: { kind: 'cwd' },
    session: { kind: 'session' },
    atc: { kind: 'atc' },
  });
});

test('it warns about a registry without the cwd source and a glob over worktrees', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.configFile,
    JSON.stringify({
      scopeSources: { all: { kind: 'globs', paths: ['/repo/.worktrees/**', '/scratch/**'] } },
    }),
  );

  const config = await loadConfig(ctx.configFile);

  expect(config.warnings).toStrictEqual([
    `${ctx.configFile}: scopeSources has no cwd entry, so the task owns only what the other sources name`,
    `${ctx.configFile}: scopeSources glob /repo/.worktrees/** covers worktrees that other tasks own`,
  ]);
});
