import { expect, test } from 'bun:test';
import { buildMockDecisionRequest } from './build-mock-decision-request.ts';

test('it builds a default decision request', () => {
  expect(buildMockDecisionRequest()).toStrictEqual({
    state: {
      policy: expect.toBeString(),
      answerGuidance: expect.toBeString(),
      rulesSource: 'shipped',
      configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
      lastUserMessage: null,
      repositoryContext: {
        cwd: expect.toStartWith('/'),
        branch: expect.toBeString(),
        defaultBranch: 'main',
        remotes: [{ name: 'origin', url: expect.toStartWith('https://github.com/') }],
        taskScope: { worktrees: [], branches: [], pullRequests: [] },
      },
      taskContext: {
        agentID: null,
        originalUserTask: { text: expect.toBeString(), origin: 'composer' },
        delegatedTask: null,
        lastDirectUserMessage: null,
        omittedTaskContext: [],
      },
      action: {
        tool: 'Bash',
        cwd: expect.toStartWith('/'),
        input: { command: expect.toBeString() },
      },
    },
    questions: {
      rule_0: {
        type: 'choice',
        instructions: expect.toBeString(),
        criteria: {
          allow: expect.toBeString(),
          block: expect.toBeString(),
          ask: expect.toBeString(),
        },
      },
    },
    rules: {
      rule_0: {
        name: expect.toBeString(),
        tier: 'hard',
        source: 'shipped',
        text: expect.toBeString(),
      },
    },
  });
});

test('it applies overrides on top of the defaults', () => {
  const request = buildMockDecisionRequest({
    state: {
      lastUserMessage: 'push it',
      configuredRules: { soft_deny: ['Never force-push'] },
      repositoryContext: { branch: 'feature' },
      taskContext: { agentID: 'agent-1' },
      action: { cwd: '/repo' },
    },
    rules: {},
  });

  expect(request).toStrictEqual({
    state: {
      policy: expect.toBeString(),
      answerGuidance: expect.toBeString(),
      rulesSource: 'shipped',
      configuredRules: {
        environment: [],
        allow: [],
        soft_deny: ['Never force-push'],
        hard_deny: [],
      },
      lastUserMessage: 'push it',
      repositoryContext: {
        cwd: expect.toStartWith('/'),
        branch: 'feature',
        defaultBranch: 'main',
        remotes: [{ name: 'origin', url: expect.toStartWith('https://github.com/') }],
        taskScope: { worktrees: [], branches: [], pullRequests: [] },
      },
      taskContext: {
        agentID: 'agent-1',
        originalUserTask: { text: expect.toBeString(), origin: 'composer' },
        delegatedTask: null,
        lastDirectUserMessage: null,
        omittedTaskContext: [],
      },
      action: { tool: 'Bash', cwd: '/repo', input: { command: expect.toBeString() } },
    },
    questions: {
      rule_0: {
        type: 'choice',
        instructions: expect.toBeString(),
        criteria: {
          allow: expect.toBeString(),
          block: expect.toBeString(),
          ask: expect.toBeString(),
        },
      },
    },
    rules: {},
  });
});
