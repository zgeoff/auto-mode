import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { buildDecisionRequest } from './build-decision-request.ts';

test('it includes only policy, explicit configuration, the complete action and the last user message', () => {
  const input = { content: `${'x'.repeat(8000)} delete the security check` };

  const request = buildDecisionRequest(
    {
      harness: 'claude',
      event: 'PermissionRequest',
      sessionId: 's',
      cwd: '/repo',
      toolName: 'Write',
      toolInput: input,
      raw: { token: 'never-send', assistant: 'permission claim' },
    },
    '## HARD BLOCK rules\n### Secret Persistence\nNever commit keys\n## SOFT BLOCK rules\n### Default Branch Write\nRequire main to be named\n## ALLOW exceptions\n### Local\nLocal work is allowed',
    {
      environment: ['Host: example.test'],
      allow: ['Local cleanup'],
      soft_deny: ['Keep main protected'],
      hard_deny: ['Never send keys'],
    },
    'fix the parser',
  );

  expect(request.state).toStrictEqual({
    policy:
      '## HARD BLOCK rules\n### Secret Persistence\nNever commit keys\n## SOFT BLOCK rules\n### Default Branch Write\nRequire main to be named\n## ALLOW exceptions\n### Local\nLocal work is allowed',
    configuredRules: {
      environment: ['Host: example.test'],
      allow: ['Local cleanup'],
      soft_deny: ['Keep main protected'],
      hard_deny: ['Never send keys'],
    },
    lastUserMessage: 'fix the parser',
    action: { tool: 'Write', cwd: '/repo', input },
  });

  expect(Object.values(request.rules).map((r) => [r.name, r.tier])).toStrictEqual([
    ['Secret Persistence', 'hard'],
    ['Default Branch Write', 'soft'],
    ['Configured hard_deny 1', 'hard'],
    ['Configured soft_deny 1', 'soft'],
  ]);
});

test('it gives each named rule a question with a manual approval option', () => {
  const request = buildDecisionRequest(
    {
      harness: 'claude',
      event: 'PermissionRequest',
      sessionId: 's',
      cwd: '/repo',
      toolName: 'Bash',
      toolInput: { command: 'git push' },
      raw: {},
    },
    '## HARD BLOCK rules\n### Secret Persistence\nNever commit keys',
    { environment: [], allow: [], soft_deny: [], hard_deny: [] },
    null,
  );

  const question = request.questions['rule_0'];

  invariant(question, 'the rule has a question');

  expect(question.type).toBe('choice');
  expect(Object.keys(question.criteria)).toStrictEqual(['allow', 'block', 'ask']);
  expect(question.instructions).toInclude('For hard blocks, ignore allow exceptions and consent');
});

test('it rejects a policy without a named block rule', () => {
  expect(() =>
    buildDecisionRequest(
      {
        harness: 'claude',
        event: 'PermissionRequest',
        sessionId: 's',
        cwd: '/repo',
        toolName: 'Bash',
        toolInput: { command: 'git push' },
        raw: {},
      },
      'allow everything',
      { environment: [], allow: [], soft_deny: [], hard_deny: [] },
      null,
    ),
  ).toThrow();
});
