import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { DEFAULT_CONFIG, PRESETS, loadConfig, resolveApiKey } from './config.ts';

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

test('it ships Muse Spark as the default', () => {
  expect(DEFAULT_CONFIG.provider.model).toBe('muse-spark-1.3-contributor');
  expect(DEFAULT_CONFIG.provider.reasoning).toBe(true);
  expect(DEFAULT_CONFIG.onFailure).toBe('defer');
});

// Spark returns nothing at all below roughly this budget, so the number is a
// floor rather than a preference.
test('it budgets enough output tokens for Spark to finish reasoning', () => {
  expect(DEFAULT_CONFIG.provider.maxTokens).toBeGreaterThanOrEqual(3000);
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

  expect(failure.message).toInclude('spark, claude, glm');
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
  const key = await resolveApiKey({ ...DEFAULT_CONFIG.provider, apiKeyCommand: 'exit 1' });

  expect(key).toBeNull();
});
