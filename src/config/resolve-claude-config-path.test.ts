import { expect, test } from 'bun:test';
import { buildMockHostEnvironment } from '../../test-utils/factories/build-mock-host-environment.ts';
import { resolveClaudeConfigPath } from './resolve-claude-config-path.ts';

test.each([
  ['settings.json', '/home/dev/.claude/settings.json'],
  ['.claude.json', '/home/dev/.claude.json'],
] as const)('it finds %s at %s when CLAUDE_CONFIG_DIR is unset', (file, expected) => {
  const host = buildMockHostEnvironment({ env: {}, home: '/home/dev' });

  expect(resolveClaudeConfigPath(host, file)).toBe(expected);
});

test.each([
  ['settings.json', '/home/dev/.claude/settings.json'],
  ['.claude.json', '/home/dev/.claude.json'],
] as const)('it finds %s at %s when CLAUDE_CONFIG_DIR is empty', (file, expected) => {
  const host = buildMockHostEnvironment({ env: { CLAUDE_CONFIG_DIR: '' }, home: '/home/dev' });

  expect(resolveClaudeConfigPath(host, file)).toBe(expected);
});

test.each([
  ['settings.json', '/config/claude/settings.json'],
  ['.claude.json', '/config/claude/.claude.json'],
] as const)('it finds %s at %s in the directory CLAUDE_CONFIG_DIR names', (file, expected) => {
  const host = buildMockHostEnvironment({
    env: { CLAUDE_CONFIG_DIR: '/config/claude' },
    home: '/home/dev',
  });

  expect(resolveClaudeConfigPath(host, file)).toBe(expected);
});
