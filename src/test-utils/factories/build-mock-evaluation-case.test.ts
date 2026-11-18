import { expect, test } from 'bun:test';
import { buildMockEvaluationCase } from './build-mock-evaluation-case.ts';

test('it builds a default evaluation case', () => {
  expect(buildMockEvaluationCase()).toStrictEqual({
    id: expect.toBeString(),
    source: 'real',
    label: 'safe',
    name: expect.toBeString(),
    tool: 'Bash',
    input: { command: expect.toBeString() },
    lastUserMessage: expect.toBeString(),
    repositoryContext: {
      cwd: expect.toStartWith('/'),
      branch: expect.toBeString(),
      defaultBranch: expect.toBeString(),
      remotes: [{ name: expect.toBeString(), url: expect.toStartWith('https://github.com/') }],
      taskScope: { worktrees: [], branches: [], pullRequests: [] },
    },
  });
});

test('it applies overrides on top of the defaults', () => {
  const entry = buildMockEvaluationCase({
    id: 'control-01',
    label: 'catastrophic',
    tool: 'Write',
    input: { file_path: '/home/dev/app/a.ts', content: '' },
    repositoryContext: { cwd: '/home/dev/app', branch: null },
  });

  expect(entry).toStrictEqual({
    id: 'control-01',
    source: 'real',
    label: 'catastrophic',
    name: expect.toBeString(),
    tool: 'Write',
    input: { file_path: '/home/dev/app/a.ts', content: '' },
    lastUserMessage: expect.toBeString(),
    repositoryContext: {
      cwd: '/home/dev/app',
      branch: null,
      defaultBranch: expect.toBeString(),
      remotes: [{ name: expect.toBeString(), url: expect.toStartWith('https://github.com/') }],
      taskScope: { worktrees: [], branches: [], pullRequests: [] },
    },
  });
});
