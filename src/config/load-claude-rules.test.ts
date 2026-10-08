import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadClaudeRules } from './load-claude-rules.ts';

async function setupTest(): Promise<{ readonly dir: string; readonly path: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'claude-rules-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir, path: join(dir, 'settings.json') };
}

test('it imports explicit rules without credentials or default markers', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    JSON.stringify({
      env: { PRIVATE_TOKEN: 'not-classifier-input' },
      permissions: { allow: ['Bash(*)'] },
      autoMode: {
        environment: ['$defaults', 'Host: example.test'],
        allow: ['$defaults', 'Local cleanup is routine'],
        soft_deny: ['$defaults', 'Require a named database'],
        hard_deny: ['$defaults', 'Never send keys'],
      },
    }),
  );

  const rules = await loadClaudeRules(ctx.path, { env: {}, home: ctx.dir });

  expect(rules).toStrictEqual({
    environment: ['Host: example.test'],
    allow: ['Local cleanup is routine'],
    soft_deny: ['Require a named database'],
    hard_deny: ['Never send keys'],
  });
});

test('it uses the shipped policy when the settings file is absent', async () => {
  const ctx = await setupTest();
  const rules = await loadClaudeRules(ctx.path, { env: {}, home: ctx.dir });

  expect(rules).toStrictEqual({ environment: [], allow: [], soft_deny: [], hard_deny: [] });
});

test('it reads the settings in the Claude config directory when no path is configured', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.path, JSON.stringify({ autoMode: { allow: ['Local cleanup is routine'] } }));

  const rules = await loadClaudeRules(undefined, {
    env: { CLAUDE_CONFIG_DIR: ctx.dir },
    home: ctx.dir,
  });

  expect(rules).toStrictEqual({
    environment: [],
    allow: ['Local cleanup is routine'],
    soft_deny: [],
    hard_deny: [],
  });
});

test('it reads the settings in the home Claude directory when no config directory is set', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, '.claude'));

  await writeFile(
    join(ctx.dir, '.claude', 'settings.json'),
    JSON.stringify({ autoMode: { hard_deny: ['Never send keys'] } }),
  );

  const rules = await loadClaudeRules(undefined, { env: {}, home: ctx.dir });

  expect(rules).toStrictEqual({
    environment: [],
    allow: [],
    soft_deny: [],
    hard_deny: ['Never send keys'],
  });
});

test('it disables importing Claude settings when the path is null', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'settings.json'), JSON.stringify({ autoMode: { allow: ['x'] } }));

  const rules = await loadClaudeRules(null, { env: { CLAUDE_CONFIG_DIR: ctx.dir }, home: ctx.dir });

  expect(rules).toStrictEqual({ environment: [], allow: [], soft_deny: [], hard_deny: [] });
});

test('it refuses settings it cannot read', async () => {
  const ctx = await setupTest();

  await mkdir(ctx.path);

  expect(loadClaudeRules(ctx.path, { env: {}, home: ctx.dir })).rejects.toThrowWithMessage(
    Error,
    'Claude settings unreadable',
  );
});

test('it refuses settings that are not JSON', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.path, '{');

  expect(loadClaudeRules(ctx.path, { env: {}, home: ctx.dir })).rejects.toThrowWithMessage(
    Error,
    'Claude settings contain invalid JSON',
  );
});

test('it refuses autoMode settings whose allow entries are not a list', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    JSON.stringify({
      autoMode: {
        environment: ['Host: example.test'],
        allow: 'Local cleanup is routine',
        soft_deny: ['Require a named database'],
        hard_deny: ['Never send keys'],
      },
    }),
  );

  expect(loadClaudeRules(ctx.path, { env: {}, home: ctx.dir })).rejects.toThrowWithMessage(
    Error,
    'Claude autoMode settings are invalid',
  );
});
