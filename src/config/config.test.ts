import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMockHostEnvironment } from '../../test-utils/factories/build-mock-host-environment.ts';
import { buildMockProviderConfig } from '../../test-utils/factories/build-mock-provider-config.ts';
import { DEFAULT_CONFIG, loadConfig, resolveApiKey, resolveConfigPath } from './config.ts';

async function setupTest(): Promise<{ readonly dir: string; readonly configFile: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-config-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir, configFile: join(dir, 'config.json') };
}

test('#loadConfig falls back to the shipped defaults when there is no config file', async () => {
  const ctx = await setupTest();

  const config = await loadConfig(
    ctx.configFile,
    buildMockHostEnvironment({ env: {}, home: ctx.dir }),
  );

  expect(config).toStrictEqual({
    provider: {
      protocol: 'system-one',
      baseURL: 'https://api.typesafe.ai',
      model: 'jev-1.13.0',
      apiKeyEnv: 'TYPESAFE_API_KEY',
      reasoning: false,
      maxTokens: 3000,
      timeoutMs: 5000,
    },
    onFailure: 'defer',
    minConfidence: 0.8,
    denialBudget: { consecutive: 3, perSession: 20 },
    scopeSources: { cwd: { kind: 'cwd' }, session: { kind: 'session' }, atc: { kind: 'atc' } },
  });
});

test('#loadConfig reads the config file under the home config directory when no path is given', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, '.config', 'auto-mode'), { recursive: true });

  await writeFile(
    join(ctx.dir, '.config', 'auto-mode', 'config.json'),
    JSON.stringify({ decision: { onFailure: 'deny' } }),
  );

  const config = await loadConfig(undefined, buildMockHostEnvironment({ env: {}, home: ctx.dir }));

  expect(config).toStrictEqual({
    provider: {
      protocol: 'system-one',
      baseURL: 'https://api.typesafe.ai',
      model: 'jev-1.13.0',
      apiKeyEnv: 'TYPESAFE_API_KEY',
      apiKeyCommand: undefined,
      reasoning: false,
      maxTokens: 3000,
      timeoutMs: 5000,
    },
    judge: null,
    scopeSources: { cwd: { kind: 'cwd' }, session: { kind: 'session' }, atc: { kind: 'atc' } },
    classifierPath: undefined,
    rulesPath: undefined,
    onFailure: 'deny',
    claudeSettingsPath: undefined,
    minConfidence: 0.8,
    denialBudget: { consecutive: 3, perSession: 20 },
    warnings: [],
  });
});

test('#loadConfig refuses a config file it cannot read', async () => {
  const ctx = await setupTest();

  await mkdir(ctx.configFile);

  expect(
    loadConfig(ctx.configFile, buildMockHostEnvironment({ env: {}, home: ctx.dir })),
  ).rejects.toThrowWithMessage(Error, 'auto-mode configuration unreadable');
});

// A broken config must not quietly run a policy the user did not write.
test('#loadConfig refuses a config that is not JSON', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.configFile, 'oops {');

  expect(
    loadConfig(ctx.configFile, buildMockHostEnvironment({ env: {}, home: ctx.dir })),
  ).rejects.toThrowWithMessage(Error, `${ctx.configFile} is not valid JSON`);
});

test('#loadConfig refuses a config that is not an object', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.configFile, '[]');

  expect(
    loadConfig(ctx.configFile, buildMockHostEnvironment({ env: {}, home: ctx.dir })),
  ).rejects.toThrowWithMessage(
    Error,
    `${ctx.configFile} is not a valid config: ✖ Invalid input: expected object, received array`,
  );
});

test('#loadConfig names the built-in kinds when a role names one that is not', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.configFile, JSON.stringify({ decision: { classifier: 'gpt' } }));

  expect(
    loadConfig(ctx.configFile, buildMockHostEnvironment({ env: {}, home: ctx.dir })),
  ).rejects.toThrowWithMessage(
    Error,
    `${ctx.configFile}: decision.classifier names 'gpt', which is neither a classifiers entry nor a built-in kind (jev, spark, claude, glm)`,
  );
});

test('#loadConfig takes a built-in kind and lets one field be overridden', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.configFile,
    JSON.stringify({
      classifiers: { glm: { timeoutMs: 45_000 } },
      decision: { classifier: 'glm' },
    }),
  );

  const config = await loadConfig(
    ctx.configFile,
    buildMockHostEnvironment({ env: {}, home: ctx.dir }),
  );

  expect(config.provider).toStrictEqual({
    protocol: 'messages',
    baseURL: 'https://api.z.ai/api/anthropic',
    model: 'glm-5.3-flash',
    apiKeyEnv: 'ZAI_API_KEY',
    apiKeyCommand: undefined,
    reasoning: true,
    maxTokens: 3000,
    timeoutMs: 45_000,
  });
});

test('#loadConfig uses Jev for a custom entry of the jev kind', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.configFile,
    JSON.stringify({
      classifiers: { mine: { kind: 'jev', baseURL: 'https://decision.example' } },
      decision: { classifier: 'mine' },
    }),
  );

  const config = await loadConfig(
    ctx.configFile,
    buildMockHostEnvironment({ env: {}, home: ctx.dir }),
  );

  expect(config.provider).toStrictEqual({
    protocol: 'system-one',
    baseURL: 'https://decision.example',
    model: 'jev-1.13.0',
    apiKeyEnv: 'TYPESAFE_API_KEY',
    apiKeyCommand: undefined,
    reasoning: false,
    maxTokens: 3000,
    timeoutMs: 5000,
  });
});

test('#loadConfig resolves the decision classifier from the registry by id', async () => {
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

  const config = await loadConfig(
    ctx.configFile,
    buildMockHostEnvironment({ env: {}, home: ctx.dir }),
  );

  expect(config).toStrictEqual({
    provider: {
      protocol: 'messages',
      baseURL: 'https://api.anthropic.com',
      model: 'claude-haiku-4-5-20251001',
      apiKeyEnv: 'ANTHROPIC_API_KEY',
      apiKeyCommand: undefined,
      reasoning: true,
      maxTokens: 3000,
      timeoutMs: 45_000,
    },
    judge: {
      protocol: 'system-one',
      baseURL: 'https://api.typesafe.ai',
      model: 'jev-1.13.0',
      apiKeyEnv: 'TYPESAFE_API_KEY',
      apiKeyCommand: undefined,
      reasoning: false,
      maxTokens: 3000,
      timeoutMs: 5000,
    },
    scopeSources: { cwd: { kind: 'cwd' }, session: { kind: 'session' }, atc: { kind: 'atc' } },
    classifierPath: undefined,
    rulesPath: undefined,
    onFailure: 'defer',
    claudeSettingsPath: undefined,
    minConfidence: 0.8,
    denialBudget: { consecutive: 3, perSession: 20 },
    warnings: [],
  });
});

test('#loadConfig falls back to a built-in kind when the registry has no entry for the role', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.configFile, JSON.stringify({ decision: { classifier: 'glm' } }));

  const config = await loadConfig(
    ctx.configFile,
    buildMockHostEnvironment({ env: {}, home: ctx.dir }),
  );

  expect(config).toStrictEqual({
    provider: {
      protocol: 'messages',
      baseURL: 'https://api.z.ai/api/anthropic',
      model: 'glm-5.3-flash',
      apiKeyEnv: 'ZAI_API_KEY',
      apiKeyCommand: undefined,
      reasoning: true,
      maxTokens: 3000,
      timeoutMs: 60_000,
    },
    judge: null,
    scopeSources: { cwd: { kind: 'cwd' }, session: { kind: 'session' }, atc: { kind: 'atc' } },
    classifierPath: undefined,
    rulesPath: undefined,
    onFailure: 'defer',
    claudeSettingsPath: undefined,
    minConfidence: 0.8,
    denialBudget: { consecutive: 3, perSession: 20 },
    warnings: [],
  });
});

test('#loadConfig drops a bad registry entry with one diagnostic line and loads the others', async () => {
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

  const config = await loadConfig(
    ctx.configFile,
    buildMockHostEnvironment({ env: {}, home: ctx.dir }),
  );

  expect(config).toStrictEqual({
    provider: {
      protocol: 'system-one',
      baseURL: 'https://api.typesafe.ai',
      model: 'jev-1.13.0',
      apiKeyEnv: 'TYPESAFE_API_KEY',
      apiKeyCommand: undefined,
      reasoning: false,
      maxTokens: 3000,
      timeoutMs: 4000,
    },
    judge: null,
    scopeSources: {
      cwd: { kind: 'cwd' },
      scratch: { kind: 'globs', paths: [join(ctx.dir, 'scratch', '**')] },
    },
    classifierPath: undefined,
    rulesPath: undefined,
    onFailure: 'defer',
    claudeSettingsPath: undefined,
    minConfidence: 0.8,
    denialBudget: { consecutive: 3, perSession: 20 },
    warnings: [
      `${ctx.configFile}: classifiers.typo dropped: unknown kind 'gpt'; known kinds are jev, spark, claude, glm, messages`,
      `${ctx.configFile}: classifiers.stray dropped: Unrecognized key: "maxToken"`,
      `${ctx.configFile}: classifiers.literal dropped: holds a literal apiKey; name the key with apiKeyEnv or apiKeyCommand`,
      `${ctx.configFile}: classifiers.bare dropped: kind 'messages' needs a model`,
      `${ctx.configFile}: scopeSources.empty dropped: kind 'globs' needs paths`,
      `${ctx.configFile}: scopeSources.nowhere dropped: unknown kind 'nowhere'; known kinds are cwd, session, globs, atc`,
    ],
  });
});

test('#loadConfig refuses a decision role that names a dropped entry', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.configFile,
    JSON.stringify({ classifiers: { mine: { kind: 'gpt' } }, decision: { classifier: 'mine' } }),
  );

  expect(
    loadConfig(ctx.configFile, buildMockHostEnvironment({ env: {}, home: ctx.dir })),
  ).rejects.toThrowWithMessage(
    Error,
    `${ctx.configFile}: decision.classifier names 'mine', whose entry was dropped`,
  );
});

test('#loadConfig refuses a decision role that names no entry and no built-in kind', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.configFile, JSON.stringify({ decision: { judge: 'nobody' } }));

  expect(
    loadConfig(ctx.configFile, buildMockHostEnvironment({ env: {}, home: ctx.dir })),
  ).rejects.toThrowWithMessage(
    Error,
    `${ctx.configFile}: decision.judge names 'nobody', which is neither a classifiers entry nor a built-in kind (jev, spark, claude, glm)`,
  );
});

test.each([
  ['preset', 'jev'],
  ['provider', { apiKeyEnv: 'TYPESAFE_API_KEY' }],
  ['classifierPath', '/policy/decision.md'],
  ['rulesPath', '/policy/rules.md'],
  ['minConfidence', 0.8],
  ['onFailure', 'deny'],
  ['transcriptEntries', 4],
  ['claudeSettingsPath', null],
])('#loadConfig refuses the old top-level key %s and names it', async (key, value) => {
  const ctx = await setupTest();

  await writeFile(ctx.configFile, JSON.stringify({ [key]: value }));

  expect(
    loadConfig(ctx.configFile, buildMockHostEnvironment({ env: {}, home: ctx.dir })),
  ).rejects.toThrowWithMessage(
    Error,
    `${ctx.configFile} is not a valid config: ✖ Unrecognized key: "${key}"`,
  );
});

test('#loadConfig reads the policy block, expanding a leading tilde', async () => {
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

  const config = await loadConfig(
    ctx.configFile,
    buildMockHostEnvironment({ env: {}, home: ctx.dir }),
  );

  expect(config).toStrictEqual({
    provider: {
      protocol: 'system-one',
      baseURL: 'https://api.typesafe.ai',
      model: 'jev-1.13.0',
      apiKeyEnv: 'TYPESAFE_API_KEY',
      apiKeyCommand: undefined,
      reasoning: false,
      maxTokens: 3000,
      timeoutMs: 5000,
    },
    judge: null,
    scopeSources: { cwd: { kind: 'cwd' }, session: { kind: 'session' }, atc: { kind: 'atc' } },
    classifierPath: undefined,
    rulesPath: join(ctx.dir, 'rules.md'),
    onFailure: 'deny',
    claudeSettingsPath: '/claude/settings.json',
    minConfidence: 0.9,
    denialBudget: { consecutive: 3, perSession: 20 },
    warnings: [],
  });
});

test('#loadConfig disables the Claude rule import when the policy sets the settings path to null', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.configFile, JSON.stringify({ policy: { claudeSettingsPath: null } }));

  const config = await loadConfig(
    ctx.configFile,
    buildMockHostEnvironment({ env: {}, home: ctx.dir }),
  );

  expect(config).toStrictEqual({
    provider: {
      protocol: 'system-one',
      baseURL: 'https://api.typesafe.ai',
      model: 'jev-1.13.0',
      apiKeyEnv: 'TYPESAFE_API_KEY',
      apiKeyCommand: undefined,
      reasoning: false,
      maxTokens: 3000,
      timeoutMs: 5000,
    },
    judge: null,
    scopeSources: { cwd: { kind: 'cwd' }, session: { kind: 'session' }, atc: { kind: 'atc' } },
    classifierPath: undefined,
    rulesPath: undefined,
    onFailure: 'defer',
    claudeSettingsPath: null,
    minConfidence: 0.8,
    denialBudget: { consecutive: 3, perSession: 20 },
    warnings: [],
  });
});

test.each([
  ['constructor', "names 'constructor', whose entry was dropped"],
  ['toString', "names 'toString', whose entry was dropped"],
  [
    '__proto__',
    "names '__proto__', which is neither a classifiers entry nor a built-in kind (jev, spark, claude, glm)",
  ],
])(
  '#loadConfig refuses a decision role named %s, which only an inherited property matches',
  async (id, refusal) => {
    const ctx = await setupTest();

    await writeFile(
      ctx.configFile,
      `{"classifiers":{"${id}":{"kind":"gpt"}},"decision":{"classifier":"${id}"}}`,
    );

    expect(
      loadConfig(ctx.configFile, buildMockHostEnvironment({ env: {}, home: ctx.dir })),
    ).rejects.toThrowWithMessage(Error, `${ctx.configFile}: decision.classifier ${refusal}`);
  },
);

test('#loadConfig loads the approved shape with no diagnostics and reads the denial budget', async () => {
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

  const config = await loadConfig(
    ctx.configFile,
    buildMockHostEnvironment({ env: {}, home: ctx.dir }),
  );

  expect(config).toStrictEqual({
    provider: {
      protocol: 'system-one',
      baseURL: 'https://api.typesafe.ai',
      model: 'jev-1.13.0',
      apiKeyEnv: 'TYPESAFE_API_KEY',
      apiKeyCommand: undefined,
      reasoning: false,
      maxTokens: 3000,
      timeoutMs: 5000,
    },
    judge: null,
    scopeSources: {
      cwd: { kind: 'cwd' },
      session: { kind: 'session' },
      scratch: { kind: 'globs', paths: [join(ctx.dir, 'scratch', '**')] },
      atc: { kind: 'atc' },
    },
    classifierPath: undefined,
    rulesPath: undefined,
    onFailure: 'defer',
    claudeSettingsPath: null,
    minConfidence: 0.8,
    denialBudget: { consecutive: 5, perSession: 40 },
    warnings: [],
  });
});

test('#loadConfig defaults the denial budget to 3 in a row and 20 per session', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.configFile, JSON.stringify({ decision: { denialBudget: {} } }));

  const config = await loadConfig(
    ctx.configFile,
    buildMockHostEnvironment({ env: {}, home: ctx.dir }),
  );

  expect(config).toStrictEqual({
    provider: {
      protocol: 'system-one',
      baseURL: 'https://api.typesafe.ai',
      model: 'jev-1.13.0',
      apiKeyEnv: 'TYPESAFE_API_KEY',
      apiKeyCommand: undefined,
      reasoning: false,
      maxTokens: 3000,
      timeoutMs: 5000,
    },
    judge: null,
    scopeSources: { cwd: { kind: 'cwd' }, session: { kind: 'session' }, atc: { kind: 'atc' } },
    classifierPath: undefined,
    rulesPath: undefined,
    onFailure: 'defer',
    claudeSettingsPath: undefined,
    minConfidence: 0.8,
    denialBudget: { consecutive: 3, perSession: 20 },
    warnings: [],
  });
});

test('#loadConfig runs the cwd, session, and atc sources when the file has no scope sources', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.configFile, JSON.stringify({ decision: { onFailure: 'defer' } }));

  const config = await loadConfig(
    ctx.configFile,
    buildMockHostEnvironment({ env: {}, home: ctx.dir }),
  );

  expect(config).toStrictEqual({
    provider: {
      protocol: 'system-one',
      baseURL: 'https://api.typesafe.ai',
      model: 'jev-1.13.0',
      apiKeyEnv: 'TYPESAFE_API_KEY',
      apiKeyCommand: undefined,
      reasoning: false,
      maxTokens: 3000,
      timeoutMs: 5000,
    },
    judge: null,
    scopeSources: { cwd: { kind: 'cwd' }, session: { kind: 'session' }, atc: { kind: 'atc' } },
    classifierPath: undefined,
    rulesPath: undefined,
    onFailure: 'defer',
    claudeSettingsPath: undefined,
    minConfidence: 0.8,
    denialBudget: { consecutive: 3, perSession: 20 },
    warnings: [],
  });
});

test('#loadConfig warns about a registry without the cwd source and a glob over worktrees', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.configFile,
    JSON.stringify({
      scopeSources: { all: { kind: 'globs', paths: ['/repo/.worktrees/**', '/scratch/**'] } },
    }),
  );

  const config = await loadConfig(
    ctx.configFile,
    buildMockHostEnvironment({ env: {}, home: ctx.dir }),
  );

  expect(config).toStrictEqual({
    provider: {
      protocol: 'system-one',
      baseURL: 'https://api.typesafe.ai',
      model: 'jev-1.13.0',
      apiKeyEnv: 'TYPESAFE_API_KEY',
      apiKeyCommand: undefined,
      reasoning: false,
      maxTokens: 3000,
      timeoutMs: 5000,
    },
    judge: null,
    scopeSources: { all: { kind: 'globs', paths: ['/repo/.worktrees/**', '/scratch/**'] } },
    classifierPath: undefined,
    rulesPath: undefined,
    onFailure: 'defer',
    claudeSettingsPath: undefined,
    minConfidence: 0.8,
    denialBudget: { consecutive: 3, perSession: 20 },
    warnings: [
      `${ctx.configFile}: scopeSources has no cwd entry, so the task owns only what the other sources name`,
      `${ctx.configFile}: scopeSources glob /repo/.worktrees/** covers worktrees that other tasks own`,
    ],
  });
});

test('#DEFAULT_CONFIG ships Jev, deferring on failure, with the default budget and scope sources', () => {
  expect(DEFAULT_CONFIG).toStrictEqual({
    provider: {
      protocol: 'system-one',
      baseURL: 'https://api.typesafe.ai',
      model: 'jev-1.13.0',
      apiKeyEnv: 'TYPESAFE_API_KEY',
      reasoning: false,
      maxTokens: 3000,
      timeoutMs: 5000,
    },
    onFailure: 'defer',
    minConfidence: 0.8,
    denialBudget: { consecutive: 3, perSession: 20 },
    scopeSources: { cwd: { kind: 'cwd' }, session: { kind: 'session' }, atc: { kind: 'atc' } },
  });
});

test('#resolveConfigPath finds the config file under the home config directory when XDG_CONFIG_HOME is unset', async () => {
  const ctx = await setupTest();

  const host = buildMockHostEnvironment({ env: {}, home: ctx.dir });

  expect(resolveConfigPath(host)).toBe(join(ctx.dir, '.config', 'auto-mode', 'config.json'));
});

test('#resolveConfigPath finds the config file under XDG_CONFIG_HOME when it is set', async () => {
  const ctx = await setupTest();

  const host = buildMockHostEnvironment({
    env: { XDG_CONFIG_HOME: join(ctx.dir, 'xdg') },
    home: ctx.dir,
  });

  expect(resolveConfigPath(host)).toBe(join(ctx.dir, 'xdg', 'auto-mode', 'config.json'));
});

test('#resolveApiKey reads the API key from the environment variable first', async () => {
  const ctx = await setupTest();

  const key = await resolveApiKey(
    buildMockProviderConfig({
      apiKeyEnv: 'AUTO_MODE_TEST_KEY',
      apiKeyCommand: 'printf from-command',
    }),
    { host: buildMockHostEnvironment({ env: { AUTO_MODE_TEST_KEY: 'from-env' }, home: ctx.dir }) },
  );

  expect(key).toBe('from-env');
});

test('#resolveApiKey falls back to the key command when the variable is unset', async () => {
  const ctx = await setupTest();

  const key = await resolveApiKey(
    buildMockProviderConfig({
      apiKeyEnv: 'AUTO_MODE_TEST_KEY',
      apiKeyCommand: 'printf from-command',
    }),
    { host: buildMockHostEnvironment({ env: {}, home: ctx.dir }) },
  );

  expect(key).toBe('from-command');
});

test('#resolveApiKey runs the key command in the injected environment', async () => {
  const ctx = await setupTest();

  const key = await resolveApiKey(
    buildMockProviderConfig({
      apiKeyEnv: 'AUTO_MODE_TEST_KEY',
      apiKeyCommand: 'printf %s "$INJECTED_KEY"',
    }),
    {
      host: buildMockHostEnvironment({ env: { INJECTED_KEY: 'from-injected-env' }, home: ctx.dir }),
    },
  );

  expect(key).toBe('from-injected-env');
});

test('#resolveApiKey gives the key command the injected home when the injected environment has none', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'key'), 'from-home-file');

  const key = await resolveApiKey(
    buildMockProviderConfig({ apiKeyEnv: 'AUTO_MODE_TEST_KEY', apiKeyCommand: 'cat "$HOME/key"' }),
    { host: buildMockHostEnvironment({ env: {}, home: ctx.dir }) },
  );

  expect(key).toBe('from-home-file');
});

test('#resolveApiKey reports no key when neither the variable nor a command is set', async () => {
  const ctx = await setupTest();

  const key = await resolveApiKey(
    buildMockProviderConfig({ apiKeyEnv: 'AUTO_MODE_TEST_KEY', apiKeyCommand: undefined }),
    { host: buildMockHostEnvironment({ env: {}, home: ctx.dir }) },
  );

  expect(key).toBeNull();
});

test('#resolveApiKey reports no key when the key command fails', async () => {
  const ctx = await setupTest();

  const key = await resolveApiKey(
    buildMockProviderConfig({ apiKeyEnv: 'AUTO_MODE_TEST_KEY', apiKeyCommand: 'exit 1' }),
    { host: buildMockHostEnvironment({ env: {}, home: ctx.dir }) },
  );

  expect(key).toBeNull();
});
