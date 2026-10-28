import { expect, mock, test } from 'bun:test';
import { buildStubProgram } from '../test-utils/build-stub-program.ts';
import { runReleaseMerge } from './run-release-merge.ts';

test('it merges a release PR once GitHub reads it as mergeable', async () => {
  const program = buildStubProgram({
    'gh pr list --repo octo/widget --head release-please--branches--main --json number --jq .[].number':
      [{ exitCode: 0, stdout: '41\n', stderr: '' }],
    'gh pr view 41 --repo octo/widget --json mergeable --jq .mergeable': [
      { exitCode: 0, stdout: 'UNKNOWN\n', stderr: '' },
      { exitCode: 0, stdout: 'MERGEABLE\n', stderr: '' },
    ],
    'gh pr merge 41 --repo octo/widget --squash': [{ exitCode: 0, stdout: '', stderr: '' }],
  });

  const wait = mock(() => Promise.resolve());

  const problems = await runReleaseMerge({
    cwd: '/repo',
    env: {},
    repository: 'octo/widget',
    attempts: 3,
    wait,
    runProgram: program,
  });

  expect(problems).toStrictEqual([]);

  expect(program).toHaveBeenCalledWith(
    ['gh', 'pr', 'merge', '41', '--repo', 'octo/widget', '--squash'],
    {
      cwd: '/repo',
      env: {},
    },
  );

  expect(wait).toHaveBeenCalledOnce();
});

test('it tries the merge again when GitHub refuses it on a stale MERGEABLE read', async () => {
  const program = buildStubProgram({
    'gh pr list --repo octo/widget --head release-please--branches--main --json number --jq .[].number':
      [{ exitCode: 0, stdout: '41\n', stderr: '' }],
    'gh pr view 41 --repo octo/widget --json mergeable --jq .mergeable': [
      { exitCode: 0, stdout: 'MERGEABLE\n', stderr: '' },
      { exitCode: 0, stdout: 'MERGEABLE\n', stderr: '' },
    ],
    'gh pr merge 41 --repo octo/widget --squash': [
      { exitCode: 1, stdout: '', stderr: 'Pull request is not mergeable' },
      { exitCode: 0, stdout: '', stderr: '' },
    ],
  });

  const problems = await runReleaseMerge({
    cwd: '/repo',
    env: {},
    repository: 'octo/widget',
    attempts: 3,
    wait: () => Promise.resolve(),
    runProgram: program,
  });

  expect(problems).toStrictEqual([]);
});

test('it reports a release PR that has conflicts without trying to merge it', async () => {
  const program = buildStubProgram({
    'gh pr list --repo octo/widget --head release-please--branches--main --json number --jq .[].number':
      [{ exitCode: 0, stdout: '41\n', stderr: '' }],
    'gh pr view 41 --repo octo/widget --json mergeable --jq .mergeable': [
      { exitCode: 0, stdout: 'CONFLICTING\n', stderr: '' },
    ],
  });

  const problems = await runReleaseMerge({
    cwd: '/repo',
    env: {},
    repository: 'octo/widget',
    attempts: 3,
    wait: () => Promise.resolve(),
    runProgram: program,
  });

  expect(problems).toStrictEqual(['release PR #41 has conflicts']);
});

test('it reports a release PR that is not mergeable after every attempt', async () => {
  const program = buildStubProgram({
    'gh pr list --repo octo/widget --head release-please--branches--main --json number --jq .[].number':
      [{ exitCode: 0, stdout: '41\n', stderr: '' }],
    'gh pr view 41 --repo octo/widget --json mergeable --jq .mergeable': [
      { exitCode: 0, stdout: 'UNKNOWN\n', stderr: '' },
      { exitCode: 0, stdout: 'UNKNOWN\n', stderr: '' },
    ],
  });

  const wait = mock(() => Promise.resolve());

  const problems = await runReleaseMerge({
    cwd: '/repo',
    env: {},
    repository: 'octo/widget',
    attempts: 2,
    wait,
    runProgram: program,
  });

  expect(problems).toStrictEqual(['release PR #41 never became mergeable']);
  expect(wait).toHaveBeenCalledOnce();
});

test('it merges nothing when no release PR is open', async () => {
  const program = buildStubProgram({
    'gh pr list --repo octo/widget --head release-please--branches--main --json number --jq .[].number':
      [{ exitCode: 0, stdout: '', stderr: '' }],
  });

  const problems = await runReleaseMerge({
    cwd: '/repo',
    env: {},
    repository: 'octo/widget',
    attempts: 3,
    wait: () => Promise.resolve(),
    runProgram: program,
  });

  expect(problems).toStrictEqual([]);
  expect(program).toHaveBeenCalledOnce();
});

test('it throws when gh cannot list the release PRs', () => {
  const program = buildStubProgram({
    'gh pr list --repo octo/widget --head release-please--branches--main --json number --jq .[].number':
      [{ exitCode: 1, stdout: '', stderr: 'HTTP 401: Bad credentials' }],
  });

  expect(
    runReleaseMerge({
      cwd: '/repo',
      env: {},
      repository: 'octo/widget',
      attempts: 3,
      wait: () => Promise.resolve(),
      runProgram: program,
    }),
  ).rejects.toThrowWithMessage(Error, 'gh pr list failed: HTTP 401: Bad credentials');
});
