import { expect, test } from 'bun:test';
import {
  READ_ONLY_COMMANDS,
  READ_ONLY_GIT_SUBCOMMANDS,
  READ_ONLY_TOOLS,
  REGENERABLE_DIRS,
  SHELL_TOOLS,
  UNSAFE_OPTIONS,
} from './local-allowlists.ts';

test('#READ_ONLY_TOOLS names no shell-carrying tool', () => {
  expect([...READ_ONLY_TOOLS]).not.toIncludeAnyMembers([...SHELL_TOOLS]);
});

test('#READ_ONLY_TOOLS names no network tool', () => {
  expect([...READ_ONLY_TOOLS]).not.toIncludeAnyMembers(['WebFetch', 'WebSearch']);
});

test('#UNSAFE_OPTIONS names only commands the read-only list allows', () => {
  expect([...READ_ONLY_COMMANDS]).toIncludeAllMembers([...UNSAFE_OPTIONS.keys()]);
});

test('#READ_ONLY_COMMANDS does not name git', () => {
  expect([...READ_ONLY_COMMANDS]).not.toContain('git');
});

test('#READ_ONLY_COMMANDS names no writing command', () => {
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
    'awk',
    'env',
    'less',
    'xxd',
    'yq',
  ]);
});

test('#READ_ONLY_GIT_SUBCOMMANDS names no writing subcommand', () => {
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
    'tag',
    'ls-remote',
  ]);
});

test('#REGENERABLE_DIRS names no source directory', () => {
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

test.each([
  ['READ_ONLY_TOOLS', READ_ONLY_TOOLS],
  ['SHELL_TOOLS', SHELL_TOOLS],
  ['READ_ONLY_COMMANDS', READ_ONLY_COMMANDS],
  ['READ_ONLY_GIT_SUBCOMMANDS', READ_ONLY_GIT_SUBCOMMANDS],
  ['REGENERABLE_DIRS', REGENERABLE_DIRS],
] as const)('#%s holds only matchable entries', (_name, entries) => {
  expect([...entries]).toSatisfyAll(
    (entry: string) => entry !== '' && entry.trim() === entry && !entry.includes('/'),
  );
});
