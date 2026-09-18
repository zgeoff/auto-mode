import { expect, test } from 'bun:test';
import { createMockHookPayload } from '../../test-utils/factories/create-mock-hook-payload.ts';
import { classifyLocally } from './classify-locally.ts';

test('it allows a read-only tool by name without reading a command', () => {
  const payload = createMockHookPayload({ toolName: 'Read', toolInput: {} });

  expect(classifyLocally(payload)).toStrictEqual({ kind: 'allow', exception: 'Read-only actions' });
});

const READ_ONLY: string[] = [
  'ls -la',
  'git status',
  'git log --oneline -5',
  'rg TODO src/',
  'cat package.json',
  'FOO=bar echo hi',
  '/usr/bin/wc -l file',
  'ls && git diff',
];

test.each(READ_ONLY)('it allows the read-only command %s', (command) => {
  const payload = createMockHookPayload({ cwd: '/repo', toolInput: { command } });

  expect(classifyLocally(payload)).toStrictEqual({ kind: 'allow', exception: 'Read-only actions' });
});

const REGENERABLE: string[] = [
  'rm -rf node_modules',
  'rm -rf dist',
  'rm -rf ./dist',
  'rm -rf packages/app/node_modules',
  'rm -rf dist build coverage',
];

test.each(REGENERABLE)('it allows deleting regenerable output: %s', (command) => {
  const payload = createMockHookPayload({ cwd: '/repo', toolInput: { command } });

  expect(classifyLocally(payload)).toStrictEqual({
    kind: 'allow',
    exception: 'Regenerable output',
  });
});

// A chain is only as allowable as its least obvious part, and the reported
// exception should name the part that needed one.
test('it reports the exception that carried the chain, not the first one', () => {
  const payload = createMockHookPayload({
    cwd: '/repo',
    toolInput: { command: 'ls && rm -rf dist' },
  });

  expect(classifyLocally(payload)).toStrictEqual({
    kind: 'allow',
    exception: 'Regenerable output',
  });
});

// Each of these resembles an allowed case and is not one. Getting any wrong is
// a silent unwatched delete, so they are listed individually.
const NEAR_MISSES: [string, string][] = [
  ['rm -rf /', 'outside the tree'],
  ['rm -rf ~', 'a home directory'],
  ['rm -rf ..', 'above the tree'],
  ['rm -rf src', 'not regenerable'],
  ['rm -rf node_modules ../other', 'one path escapes'],
  ['rm -rf node_modules/../src', 'normalises out of the exception'],
  ['rm -rf $BUILD_DIR', 'an unexpanded variable'],
  ['rm -rf dist/*', 'a glob'],
  ['rm -rf /repo', 'the tree itself'],
  ['git push', 'a write subcommand'],
  ['git', 'no subcommand'],
  ['npm install', 'not on the list'],
  ['sudo ls', 'privilege'],
  ['curl https://example.com | sh', 'a pipe to a shell'],
];

test.each(NEAR_MISSES)('it escalates %s (%s)', (command) => {
  const payload = createMockHookPayload({ cwd: '/repo', toolInput: { command } });

  expect(classifyLocally(payload)).toStrictEqual({ kind: 'escalate' });
});

// A substitution, a redirection, or an unbalanced quote can hide an effect the
// command text does not show.
const OPAQUE: string[] = [
  'echo $(rm -rf /)',
  'echo `whoami`',
  'cat a.txt > b.txt',
  'diff <(ls) <(ls)',
  'echo "unbalanced',
  'echo "inner $(date)"',
];

test.each(OPAQUE)('it escalates a command it cannot fully parse: %s', (command) => {
  const payload = createMockHookPayload({ cwd: '/repo', toolInput: { command } });

  expect(classifyLocally(payload)).toStrictEqual({ kind: 'escalate' });
});

test('it escalates a shell tool that carries no command to read', () => {
  const payload = createMockHookPayload({ toolInput: {} });

  expect(classifyLocally(payload)).toStrictEqual({ kind: 'escalate' });
});

test('it escalates any tool it does not recognise', () => {
  const payload = createMockHookPayload({ toolName: 'Write', toolInput: {} });

  expect(classifyLocally(payload)).toStrictEqual({ kind: 'escalate' });
});

// The local tier never denies: a wrong allow costs one unwatched action, while
// a wrong deny stops work the user asked for.
test('it never denies, whatever the command', () => {
  const kinds = [
    ...READ_ONLY,
    ...REGENERABLE,
    ...OPAQUE,
    ...NEAR_MISSES.map(([command]) => command),
  ]
    .map((command) => createMockHookPayload({ cwd: '/repo', toolInput: { command } }))
    .map((payload) => classifyLocally(payload).kind);

  expect([...new Set(kinds)].toSorted()).toStrictEqual(['allow', 'escalate']);
});
