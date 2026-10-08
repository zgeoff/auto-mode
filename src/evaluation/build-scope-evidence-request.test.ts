import { expect, test } from 'bun:test';
import { buildMockDecisionRequest } from '../../test-utils/factories/build-mock-decision-request.ts';
import { buildMockOwnedScope } from '../../test-utils/factories/build-mock-owned-scope.ts';
import { buildScopeEvidenceRequest } from './build-scope-evidence-request.ts';

test('it sends the request unchanged when the detector finds nothing', () => {
  const request = buildMockDecisionRequest();

  expect(buildScopeEvidenceRequest(request, buildMockOwnedScope(), [])).toBe(request);
});

test('it adds the owned scope, the findings, and one instruction to every question', () => {
  const request = buildMockDecisionRequest({
    questions: {
      q1: {
        type: 'choice',
        instructions: 'Must the action be refused?',
        criteria: { allow: 'no', block: 'yes', ask: 'unsure' },
      },
      q2: {
        type: 'choice',
        instructions: 'Is the push outbound?',
        criteria: { allow: 'no', block: 'yes', ask: 'unsure' },
      },
    },
  });

  const scope = buildMockOwnedScope({
    worktrees: ['/w/a'],
    branches: ['feat/a'],
    pullRequests: [{ number: 7, repository: 'github.com/dev/app' }],
  });

  // The evidence field sits outside the request type, so the result is
  // compared as a plain value.
  const evidenced: unknown = buildScopeEvidenceRequest(request, scope, [
    { kind: 'path', target: '/w/b' },
  ]);

  expect(evidenced).toStrictEqual({
    ...request,
    state: {
      ...request.state,
      scopeEvidence: {
        ownedWorktrees: ['/w/a'],
        ownedBranches: ['feat/a'],
        ownedPullRequests: [7],
        findings: [{ kind: 'path', target: '/w/b' }],
      },
    },
    questions: {
      q1: {
        type: 'choice',
        instructions:
          "Must the action be refused?\nstate.scopeEvidence lists the task's own worktrees, branches, and pull requests, and the parts of the pending action that a deterministic check found outside them. Treat each finding as a fact about the action. A finding's target belongs to other work unless the last direct user message names that target. A general request, such as to clean up, push, or merge, does not cover a target that it does not name.",
        criteria: { allow: 'no', block: 'yes', ask: 'unsure' },
      },
      q2: {
        type: 'choice',
        instructions:
          "Is the push outbound?\nstate.scopeEvidence lists the task's own worktrees, branches, and pull requests, and the parts of the pending action that a deterministic check found outside them. Treat each finding as a fact about the action. A finding's target belongs to other work unless the last direct user message names that target. A general request, such as to clean up, push, or merge, does not cover a target that it does not name.",
        criteria: { allow: 'no', block: 'yes', ask: 'unsure' },
      },
    },
  });
});
