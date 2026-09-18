import { expect, test } from 'bun:test';
import * as z from 'zod';
import { SETTINGS_PATHS, SETUP_NOTES, buildHookConfig } from './hook-config.ts';

const handlerSchema = z.record(z.string(), z.unknown());
const pluralSchema = z.object({ hooks: z.tuple([handlerSchema]) });
const entrySchema = z.object({ hooks: z.object({ PreToolUse: z.tuple([pluralSchema]) }) });
const CMD = '/usr/bin/node /opt/auto-mode/cli.js run';

// Claude matches tool names on a regular expression, so every tool is `.*`.
// Both `*` and `""` leave the hook installed and silently never firing: the
// first is not valid regex, the second matches only an empty tool name.
test('it gives Claude a regular expression that matches every tool', () => {
  expect(JSON.parse(buildHookConfig('claude', CMD))).toStrictEqual({
    hooks: {
      PreToolUse: [{ matcher: '.*', hooks: [{ type: 'command', command: CMD, timeout: 90 }] }],
    },
  });
});

// The same value means opposite things in the two harnesses, so this pair is
// asserted together to stop a future edit unifying them.
test('it uses a different match-everything value for Claude and Muse', () => {
  expect(buildHookConfig('claude', CMD)).toContain('"matcher": ".*"');
  expect(buildHookConfig('muse', CMD)).toContain('"matcher": ""');
});

// Codex registers a bare handler list; its own hooks.json carries no matcher.
test('it gives Codex no matcher', () => {
  expect(JSON.parse(buildHookConfig('codex', CMD))).toStrictEqual({
    hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: CMD, timeout: 90 }] }] },
  });
});

// Muse 1.3 skips a whole handler that carries an unknown field, silently, so an
// extra key here means the hook never runs at all.
test('it gives Muse only type and command', () => {
  const entry = entrySchema.parse(JSON.parse(buildHookConfig('muse', CMD)));

  expect(Object.keys(entry.hooks.PreToolUse[0].hooks[0]).toSorted()).toStrictEqual([
    'command',
    'type',
  ]);
});

// The model needs 13-24s on a hard case; a shorter harness timeout would make
// every hard case a silent failure.
test('it allows longer than the model takes', () => {
  for (const harness of ['claude', 'codex'] as const) {
    expect(buildHookConfig(harness, CMD)).toContain('"timeout": 90');
  }
});

test('it names where each harness keeps its settings', () => {
  expect(SETTINGS_PATHS.muse).toContain('muse/settings.json');
  expect(SETTINGS_PATHS.codex).toContain('hooks.json');
});

// Each harness has one non-obvious requirement that makes the hook silently not
// run, so each is written down where `init` will print it.
test('it warns about what each harness needs beyond the entry', () => {
  expect(SETUP_NOTES.codex.join(' ')).toContain('trust');
  expect(SETUP_NOTES.muse.join(' ')).toContain('scrubbed environment');
  expect(SETUP_NOTES.claude.join(' ')).toContain('before the hook sees it');
});
