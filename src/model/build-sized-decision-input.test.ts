import { expect, test } from 'bun:test';
import { buildMockClaudeRules } from '../../test-utils/factories/build-mock-claude-rules.ts';
import { buildSizedDecisionInput } from './build-sized-decision-input.ts';

test('it keeps a request that fits with its task context whole', () => {
  const sized = buildSizedDecisionInput('jev-1.13.0', {
    state: {
      policy: 'Refuse a push to main.',
      answerGuidance: 'Use the policy.',
      rulesSource: 'shipped',
      configuredRules: buildMockClaudeRules(),
      lastUserMessage: null,
      taskContext: {
        agentID: null,
        originalUserTask: null,
        delegatedTask: { text: 'Check the nightly build.', origin: 'agent.spawn' },
        lastDirectUserMessage: null,
        omittedTaskContext: [],
      },
      action: { tool: 'Bash', cwd: '/work/app', input: { command: 'bun test' } },
    },
    questions: {},
  });

  expect(sized.input.state.taskContext?.delegatedTask).toStrictEqual({
    text: 'Check the nightly build.',
    origin: 'agent.spawn',
  });
});

test('it drops the delegated task first when the request is too large', () => {
  const sized = buildSizedDecisionInput('jev-1.13.0', {
    state: {
      policy: 'Refuse a push to main. '.repeat(4250),
      answerGuidance: 'Use the policy.',
      rulesSource: 'shipped',
      configuredRules: buildMockClaudeRules(),
      lastUserMessage: null,
      taskContext: {
        agentID: null,
        originalUserTask: { text: 'Fix the release notes.', origin: 'composer' },
        delegatedTask: { text: 'Check the nightly build. '.repeat(100), origin: 'agent.spawn' },
        lastDirectUserMessage: null,
        omittedTaskContext: [],
      },
      action: { tool: 'Bash', cwd: '/work/app', input: { command: 'bun test' } },
    },
    questions: {},
  });

  expect(sized.input.state.taskContext).toStrictEqual({
    agentID: null,
    originalUserTask: { text: 'Fix the release notes.', origin: 'composer' },
    delegatedTask: null,
    lastDirectUserMessage: null,
    omittedTaskContext: [{ field: 'delegatedTask', reason: 'budget' }],
  });
});

test('it drops both tasks when dropping the delegated task is not enough', () => {
  const sized = buildSizedDecisionInput('jev-1.13.0', {
    state: {
      policy: 'Refuse a push to main. '.repeat(4300),
      answerGuidance: 'Use the policy.',
      rulesSource: 'shipped',
      configuredRules: buildMockClaudeRules(),
      lastUserMessage: null,
      taskContext: {
        agentID: null,
        originalUserTask: { text: 'Fix the release notes. '.repeat(200), origin: 'composer' },
        delegatedTask: { text: 'Check the nightly build. '.repeat(100), origin: 'agent.spawn' },
        lastDirectUserMessage: null,
        omittedTaskContext: [],
      },
      action: { tool: 'Bash', cwd: '/work/app', input: { command: 'bun test' } },
    },
    questions: {},
  });

  expect(sized.input.state.taskContext).toStrictEqual({
    agentID: null,
    originalUserTask: null,
    delegatedTask: null,
    lastDirectUserMessage: null,
    omittedTaskContext: [
      { field: 'delegatedTask', reason: 'budget' },
      { field: 'originalUserTask', reason: 'budget' },
    ],
  });
});
