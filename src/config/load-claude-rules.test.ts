import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadClaudeRules } from './load-claude-rules.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'claude-rules-'));

  return {
    dir,
    path: join(dir, 'settings.json'),
    async [Symbol.asyncDispose]() {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test('it imports explicit rules without credentials or default markers', async () => {
  await using ctx = await setupTest();

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
  await using ctx = await setupTest();

  const rules = await loadClaudeRules(ctx.path, { env: {}, home: ctx.dir });

  expect(rules).toStrictEqual({ environment: [], allow: [], soft_deny: [], hard_deny: [] });
});

test('it reads the settings in the Claude config directory when no path is configured', async () => {
  await using ctx = await setupTest();

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

test('it disables importing Claude settings when the path is null', async () => {
  await using ctx = await setupTest();

  await writeFile(join(ctx.dir, 'settings.json'), JSON.stringify({ autoMode: { allow: ['x'] } }));

  const rules = await loadClaudeRules(null, { env: { CLAUDE_CONFIG_DIR: ctx.dir }, home: ctx.dir });

  expect(rules).toStrictEqual({ environment: [], allow: [], soft_deny: [], hard_deny: [] });
});

test.each(['{', '{"autoMode":{"allow":"not-an-array"}}'])(
  'it refuses malformed settings %s',
  async (body) => {
    await using ctx = await setupTest();

    await writeFile(ctx.path, body);

    await expect(loadClaudeRules(ctx.path, { env: {}, home: ctx.dir })).toReject();
  },
);
