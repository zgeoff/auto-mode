import { expect, test } from 'bun:test';
import {
  READ_ONLY_COMMANDS,
  READ_ONLY_GIT_SUBCOMMANDS,
  READ_ONLY_TOOLS,
  REGENERABLE_DIRS,
  SHELL_TOOLS,
} from './local-allowlists.ts';

// A tool in both sets would be allowed on its name, so its command would never
// be read.
test('#READ_ONLY_TOOLS names no tool that #SHELL_TOOLS names', () => {
  expect([...READ_ONLY_TOOLS]).not.toIncludeAnyMembers([...SHELL_TOOLS]);
});

// git is judged by subcommand, so allowing the bare name would allow git push.
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
  ]);
});

// Deleting one of these is the Regenerable output exception, so a source
// directory here would allow the agent to delete work that is not reproducible.
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

// An entry with surrounding space or a path separator never matches, because
// the caller compares against a single trimmed word.
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
