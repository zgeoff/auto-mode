import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import type { DecisionRequest } from '../model/types.ts';
import { buildScopeEvidenceRequest } from './build-scope-evidence-request.ts';

function setupTest() {
  const request: DecisionRequest = {
    state: {
      policy: 'policy',
      answerGuidance: 'guidance',
      rulesSource: 'shipped',
      configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
      lastUserMessage: 'Clean up your own worktree.',
      action: { tool: 'Bash', cwd: '/w/a', input: { command: 'rm -rf ../b' } },
    },
    questions: {
      q1: {
        type: 'choice',
        instructions: 'Must the action be refused?',
        criteria: { allow: 'no', block: 'yes', ask: 'unsure' },
      },
    },
    rules: {},
  };

  const scope = {
    home: '/home/dev',
    worktrees: ['/w/a'],
    branches: ['feat/a'],
    currentBranch: 'feat/a',
    remotes: [{ name: 'origin', url: 'github.com/dev/app' }],
    pullRequests: [{ number: 7, repository: 'github.com/dev/app' }],
    pathGlobs: [],
  };

  return { request, scope };
}

test('it sends the request unchanged when the detector finds nothing', () => {
  const ctx = setupTest();

  expect(buildScopeEvidenceRequest(ctx.request, ctx.scope, [])).toBe(ctx.request);
});

test('it adds the owned scope, the findings, and one instruction to every question', () => {
  const ctx = setupTest();
  const findings = [{ kind: 'path', target: '/w/b' }] as const;
  const request = buildScopeEvidenceRequest(ctx.request, ctx.scope, findings);
  const question = request.questions['q1'];

  invariant(question !== undefined, 'The question survives.');

  expect(question.instructions).toStartWith(
    'Must the action be refused?\nstate.scopeEvidence lists',
  );

  const state: unknown = request.state;

  expect(state).toStrictEqual({
    ...ctx.request.state,
    scopeEvidence: {
      ownedWorktrees: ['/w/a'],
      ownedBranches: ['feat/a'],
      ownedPullRequests: [7],
      findings,
    },
  });
});
