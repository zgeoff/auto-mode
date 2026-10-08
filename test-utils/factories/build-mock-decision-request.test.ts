import { expect, test } from 'bun:test';
import { buildMockDecisionRequest } from './build-mock-decision-request.ts';
import { buildMockDecisionRule } from './build-mock-decision-rule.ts';

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
        defaultBranch: expect.toBeString(),
        remotes: [{ name: expect.toBeString(), url: expect.toStartWith('https://github.com/') }],
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
        defaultBranch: expect.toBeString(),
        remotes: [{ name: expect.toBeString(), url: expect.toStartWith('https://github.com/') }],
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

test('it asks one question per rule when the rules are overridden', () => {
  const request = buildMockDecisionRequest({
    rules: {
      hard_deny_0: buildMockDecisionRule({ source: 'configured', tier: 'hard' }),
      soft_deny_0: buildMockDecisionRule({ source: 'configured', tier: 'soft' }),
    },
  });

  expect(request.questions).toStrictEqual({
    hard_deny_0: {
      type: 'choice',
      instructions: expect.toBeString(),
      criteria: {
        allow: expect.toBeString(),
        block: expect.toBeString(),
        ask: expect.toBeString(),
      },
    },
    soft_deny_0: {
      type: 'choice',
      instructions: expect.toBeString(),
      criteria: {
        allow: expect.toBeString(),
        block: expect.toBeString(),
        ask: expect.toBeString(),
      },
    },
  });
});

test('it keeps the questions a test states over the ones derived from the rules', () => {
  const request = buildMockDecisionRequest({
    questions: {},
    rules: { rule_0: buildMockDecisionRule() },
  });

  expect(request.questions).toStrictEqual({});
});
