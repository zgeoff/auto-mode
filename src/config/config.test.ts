import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { DEFAULT_CONFIG, loadConfig, PRESETS, resolveApiKey } from './config.ts';

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function writeConfig(body: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-config-'));

  dirs.push(dir);

  const path = join(dir, 'config.json');

  await writeFile(path, body);

  return path;
}

test('it falls back to the shipped defaults when there is no config file', async () => {
  await expect(loadConfig('/nowhere/config.json')).resolves.toStrictEqual(DEFAULT_CONFIG);
});

test('it ships Muse Spark as the default', () => {
  expect(DEFAULT_CONFIG.provider.model).toBe('muse-spark-1.3-contributor');
  expect(DEFAULT_CONFIG.provider.reasoning).toBe(true);

  // Spark returns nothing at all below roughly this budget, so it is a floor
  // rather than a preference.
  expect(DEFAULT_CONFIG.provider.maxTokens).toBeGreaterThanOrEqual(3000);
  expect(DEFAULT_CONFIG.onFailure).toBe('defer');
});

test('it takes a preset and lets one field be overridden', async () => {
  const path = await writeConfig(
    JSON.stringify({ preset: 'glm', provider: { timeoutMs: 45_000 } }),
  );

  const config = await loadConfig(path);

  expect(config.provider.model).toBe(PRESETS['glm']?.model);
  expect(config.provider.baseURL).toBe(PRESETS['glm']?.baseURL);
  expect(config.provider.timeoutMs).toBe(45_000);
});

// A broken config must not quietly run a policy the user did not write.
test.each([
  ['not JSON', 'oops {'],
  ['not an object', '[]'],
  ['an unknown preset', JSON.stringify({ preset: 'gpt' })],
])('it refuses %s', async (_name, body) => {
  await expect(loadConfig(await writeConfig(body))).rejects.toThrow();
});

test('it names the known presets when the config asks for one that is not', async () => {
  await expect(loadConfig(await writeConfig(JSON.stringify({ preset: 'gpt' })))).rejects.toThrow(
    /spark, claude, glm/,
  );
});

test('it prefers the environment variable and falls back to the key command', async () => {
  process.env['AUTO_MODE_TEST_KEY'] = 'from-env';

  await expect(
    resolveApiKey({ ...DEFAULT_CONFIG.provider, apiKeyEnv: 'AUTO_MODE_TEST_KEY' }),
  ).resolves.toBe('from-env');

  delete process.env['AUTO_MODE_TEST_KEY'];

  await expect(
    resolveApiKey({
      ...DEFAULT_CONFIG.provider,
      apiKeyEnv: 'AUTO_MODE_TEST_KEY',
      apiKeyCommand: 'printf from-command',
    }),
  ).resolves.toBe('from-command');

  await expect(
    resolveApiKey({ ...DEFAULT_CONFIG.provider, apiKeyEnv: 'AUTO_MODE_TEST_KEY' }),
  ).resolves.toBeNull();

  await expect(
    resolveApiKey({ ...DEFAULT_CONFIG.provider, apiKeyCommand: 'exit 1' }),
  ).resolves.toBeNull();
});
