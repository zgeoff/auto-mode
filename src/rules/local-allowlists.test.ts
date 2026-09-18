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
test('it names no tool as both read-only and shell-carrying', () => {
  const both = [...READ_ONLY_TOOLS].filter((tool) => SHELL_TOOLS.has(tool));

  expect(both).toBeEmpty();
});

// git is judged by subcommand, so allowing the bare name would allow git push.
test('it does not name git as a read-only command', () => {
  expect(READ_ONLY_COMMANDS.has('git')).toBe(false);
});

test('it names no writing command as read-only', () => {
  const writing = ['rm', 'mv', 'cp', 'chmod', 'chown', 'curl', 'wget', 'ssh', 'npm', 'sed', 'tee'];
  const allowed = writing.filter((command) => READ_ONLY_COMMANDS.has(command));

  expect(allowed).toBeEmpty();
});

test('it names no writing subcommand as a read-only git subcommand', () => {
  const writing = ['push', 'commit', 'reset', 'clean', 'checkout', 'merge', 'rebase', 'add', 'rm'];
  const allowed = writing.filter((sub) => READ_ONLY_GIT_SUBCOMMANDS.has(sub));

  expect(allowed).toBeEmpty();
});

// Deleting one of these is the Regenerable output exception, so a source
// directory here would allow the agent to delete work that is not reproducible.
test('it names no source directory as regenerable', () => {
  const source = ['.git', 'src', 'lib', 'app', 'test', 'docs', 'policy', '.github'];
  const regenerable = source.filter((dir) => REGENERABLE_DIRS.has(dir));

  expect(regenerable).toBeEmpty();
});

const SETS: [string, ReadonlySet<string>][] = [
  ['READ_ONLY_TOOLS', READ_ONLY_TOOLS],
  ['SHELL_TOOLS', SHELL_TOOLS],
  ['READ_ONLY_COMMANDS', READ_ONLY_COMMANDS],
  ['READ_ONLY_GIT_SUBCOMMANDS', READ_ONLY_GIT_SUBCOMMANDS],
  ['REGENERABLE_DIRS', REGENERABLE_DIRS],
];

// An entry with surrounding space or a path separator never matches, because
// the caller compares against a single trimmed word.
test.each(SETS)('it holds only matchable entries in %s', (_name, entries) => {
  const unmatchable = [...entries].filter(
    (entry) => entry.trim() !== entry || entry === '' || entry.includes('/'),
  );

  expect(unmatchable).toBeEmpty();
});
