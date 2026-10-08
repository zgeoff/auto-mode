import { expect, test } from 'bun:test';
import * as allowlists from './local-allowlists.ts';
import {
  READ_ONLY_COMMANDS,
  READ_ONLY_GIT_SUBCOMMANDS,
  READ_ONLY_TOOLS,
  REGENERABLE_DIRS,
  SHELL_TOOLS,
} from './local-allowlists.ts';

// A tool in both sets would be allowed on its name, so its command would never
// be read.
test('it names no tool as both read-only and shell-carrying', () => {
  expect([...READ_ONLY_TOOLS]).not.toIncludeAnyMembers([...SHELL_TOOLS]);
});

// git is judged by subcommand, so allowing the bare name would allow git push.
test('it does not name git as a read-only command', () => {
  expect([...READ_ONLY_COMMANDS]).not.toContain('git');
});

test('it names no writing command as read-only', () => {
  expect([...READ_ONLY_COMMANDS]).not.toIncludeAnyMembers([
    'rm',
    'mv',
    'cp',
    'chmod',
    'chown',
    'curl',
    'wget',
    'ssh',
    'npm',
    'sed',
    'tee',
  ]);
});

test('it names no writing subcommand as a read-only git subcommand', () => {
  expect([...READ_ONLY_GIT_SUBCOMMANDS]).not.toIncludeAnyMembers([
    'push',
    'commit',
    'reset',
    'clean',
    'checkout',
    'merge',
    'rebase',
    'add',
    'rm',
  ]);
});

// Deleting one of these is the Regenerable output exception, so a source
// directory here would allow the agent to delete work that is not reproducible.
test('it names no source directory as regenerable', () => {
  expect([...REGENERABLE_DIRS]).not.toIncludeAnyMembers([
    '.git',
    'src',
    'lib',
    'app',
    'test',
    'docs',
    'policy',
    '.github',
  ]);
});

// An entry with surrounding space or a path separator never matches, because
// the caller compares against a single trimmed word.
test.each([
  ['read-only tools', 'READ_ONLY_TOOLS'],
  ['shell tools', 'SHELL_TOOLS'],
  ['read-only commands', 'READ_ONLY_COMMANDS'],
  ['read-only git subcommands', 'READ_ONLY_GIT_SUBCOMMANDS'],
  ['regenerable directories', 'REGENERABLE_DIRS'],
] as const)('it holds only matchable entries in the %s', (_label, name) => {
  expect([...allowlists[name]]).toSatisfyAll(
    (entry: string) => entry !== '' && entry.trim() === entry && !entry.includes('/'),
  );
});
