import { expect, test } from 'vitest';
import { hookConfig, SETTINGS_PATHS } from './hook-config.ts';

const CMD = '/usr/bin/node /opt/auto-mode/cli.js run';

// Claude matches on a regular expression. `*` is not one: it matches nothing, so
// the hook reads as installed and never fires.
test('it gives Claude an empty matcher, which matches every tool', () => {
  expect(JSON.parse(hookConfig('claude', CMD))).toStrictEqual({
    hooks: { PreToolUse: [{ matcher: '', hooks: [{ type: 'command', command: CMD, timeout: 90 }] }] },
  });
});

// Codex registers a bare handler list; its own hooks.json carries no matcher.
test('it gives Codex no matcher', () => {
  expect(JSON.parse(hookConfig('codex', CMD))).toStrictEqual({
    hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: CMD, timeout: 90 }] }] },
  });
});

// Muse 1.3 skips a whole handler that carries an unknown field, silently, so an
// extra key here means the hook never runs at all.
test('it gives Muse only type and command', () => {
  const entry = JSON.parse(hookConfig('muse', CMD)) as {
    hooks: { PreToolUse: [{ hooks: [Record<string, unknown>] }] };
  };

  expect(Object.keys(entry.hooks.PreToolUse[0].hooks[0]).sort()).toStrictEqual(['command', 'type']);
});

// The model needs 13-24s on a hard case; a shorter harness timeout would make
// every hard case a silent failure.
test('it allows longer than the model takes', () => {
  for (const harness of ['claude', 'codex'] as const) {
    expect(hookConfig(harness, CMD)).toContain('"timeout": 90');
  }
});

test('it names where each harness keeps its settings', () => {
  expect(SETTINGS_PATHS.muse).toContain('muse/settings.json');
  expect(SETTINGS_PATHS.codex).toContain('hooks.json');
});
