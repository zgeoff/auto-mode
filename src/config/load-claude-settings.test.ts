import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMockHostEnvironment } from '../../test-utils/factories/build-mock-host-environment.ts';
import { loadClaudeSettings } from './load-claude-settings.ts';

async function setupTest(): Promise<{ readonly dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'claude-settings-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it takes the rules and the user settings from the one user settings file', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, '.claude'));

  await writeFile(
    join(ctx.dir, '.claude', 'settings.json'),
    JSON.stringify({
      enabledMcpjsonServers: ['docs'],
      autoMode: { hard_deny: ['Never send keys'] },
    }),
  );

  const settings = await loadClaudeSettings(
    undefined,
    buildMockHostEnvironment({ env: {}, home: ctx.dir }),
  );

  expect(settings).toStrictEqual({
    rules: { environment: [], allow: [], soft_deny: [], hard_deny: ['Never send keys'] },
    userSettings: {
      enabledMcpjsonServers: ['docs'],
      autoMode: { hard_deny: ['Never send keys'] },
    },
  });
});

test('it takes the rules from a configured path and the user settings from the user file', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, '.claude'));

  await writeFile(
    join(ctx.dir, '.claude', 'settings.json'),
    JSON.stringify({ enabledMcpjsonServers: ['docs'], autoMode: { hard_deny: ['Ignored'] } }),
  );

  await writeFile(
    join(ctx.dir, 'rules.json'),
    JSON.stringify({ autoMode: { soft_deny: ['Require a named database'] } }),
  );

  const settings = await loadClaudeSettings(
    join(ctx.dir, 'rules.json'),
    buildMockHostEnvironment({ env: {}, home: ctx.dir }),
  );

  expect(settings).toStrictEqual({
    rules: { environment: [], allow: [], soft_deny: ['Require a named database'], hard_deny: [] },
    userSettings: { enabledMcpjsonServers: ['docs'], autoMode: { hard_deny: ['Ignored'] } },
  });
});

test('it keeps the configured rules when the user settings are not JSON', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, '.claude'));
  await writeFile(join(ctx.dir, '.claude', 'settings.json'), '{');

  await writeFile(
    join(ctx.dir, 'rules.json'),
    JSON.stringify({ autoMode: { hard_deny: ['Never send keys'] } }),
  );

  const settings = await loadClaudeSettings(
    join(ctx.dir, 'rules.json'),
    buildMockHostEnvironment({ env: {}, home: ctx.dir }),
  );

  expect(settings).toStrictEqual({
    rules: { environment: [], allow: [], soft_deny: [], hard_deny: ['Never send keys'] },
    userSettings: null,
  });
});

test('it reads the user settings but no rules when importing rules is disabled', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, '.claude'));

  await writeFile(
    join(ctx.dir, '.claude', 'settings.json'),
    JSON.stringify({ enableAllProjectMcpServers: true, autoMode: { hard_deny: ['Ignored'] } }),
  );

  const settings = await loadClaudeSettings(
    null,
    buildMockHostEnvironment({ env: {}, home: ctx.dir }),
  );

  expect(settings).toStrictEqual({
    rules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
    userSettings: { enableAllProjectMcpServers: true, autoMode: { hard_deny: ['Ignored'] } },
  });
});

test('it reads absent user settings as none', async () => {
  const ctx = await setupTest();

  const settings = await loadClaudeSettings(
    undefined,
    buildMockHostEnvironment({ env: {}, home: ctx.dir }),
  );

  expect(settings).toStrictEqual({
    rules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
    userSettings: null,
  });
});
