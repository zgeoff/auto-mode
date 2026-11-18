import { expect, test } from 'bun:test';
import { buildStubProgram } from './build-stub-program.ts';

test('it answers each command its results in order', () => {
  const program = buildStubProgram({
    'gh pr view 7': [
      { exitCode: 0, stdout: 'UNKNOWN\n', stderr: '' },
      { exitCode: 0, stdout: 'MERGEABLE\n', stderr: '' },
    ],
  });

  const first = program(['gh', 'pr', 'view', '7'], { cwd: '/repo', env: {} });
  const second = program(['gh', 'pr', 'view', '7'], { cwd: '/repo', env: {} });

  expect(first).toStrictEqual({ exitCode: 0, stdout: 'UNKNOWN\n', stderr: '' });
  expect(second).toStrictEqual({ exitCode: 0, stdout: 'MERGEABLE\n', stderr: '' });
});

test('it throws on a call past the last answer of a command', () => {
  const program = buildStubProgram({ 'git status': [{ exitCode: 0, stdout: '', stderr: '' }] });

  program(['git', 'status'], { cwd: '/repo', env: {} });

  expect(() => program(['git', 'status'], { cwd: '/repo', env: {} })).toThrowWithMessage(
    Error,
    'the stub program has no answer left for: git status',
  );
});

test('it throws on a command the table lacks', () => {
  const program = buildStubProgram({ 'git status': [{ exitCode: 0, stdout: '', stderr: '' }] });

  expect(() => program(['git', 'log'], { cwd: '/repo', env: {} })).toThrowWithMessage(
    Error,
    'the stub program has no answer left for: git log',
  );
});

test('it records each call with its options', () => {
  const program = buildStubProgram({ 'git status': [{ exitCode: 0, stdout: '', stderr: '' }] });

  program(['git', 'status'], { cwd: '/repo', env: { PATH: '/usr/bin' } });

  expect(program.mock.calls).toStrictEqual([
    [['git', 'status'], { cwd: '/repo', env: { PATH: '/usr/bin' } }],
  ]);
});
