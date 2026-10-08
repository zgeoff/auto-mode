import { expect, test } from 'bun:test';
import { buildMockDecisionQuestion } from '../../test-utils/factories/build-mock-decision-question.ts';
import { buildMockDecisionRequest } from '../../test-utils/factories/build-mock-decision-request.ts';
import { buildMockOwnedScope } from '../../test-utils/factories/build-mock-owned-scope.ts';
import { buildMockScopeFinding } from '../../test-utils/factories/build-mock-scope-finding.ts';
import { buildScopeEvidenceRequest } from './build-scope-evidence-request.ts';

test('it sends the request unchanged when the detector finds nothing', () => {
  const request = buildMockDecisionRequest();

  expect(buildScopeEvidenceRequest(request, buildMockOwnedScope(), [])).toBe(request);
});

test('it adds the owned scope, the findings, and one instruction to every question', () => {
  const q1 = buildMockDecisionQuestion({ instructions: 'Must the action be refused?' });
  const q2 = buildMockDecisionQuestion({ instructions: 'Is the push outbound?' });
  const request = buildMockDecisionRequest({ questions: { q1, q2 } });

  const scope = buildMockOwnedScope({
    worktrees: ['/w/a'],
    branches: ['feat/a'],
    pullRequests: [{ number: 7, repository: 'github.com/dev/app' }],
  });

  const evidenced = buildScopeEvidenceRequest(request, scope, [
    buildMockScopeFinding({ kind: 'path', target: '/w/b' }),
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
        ...q1,
        instructions:
          "Must the action be refused?\nstate.scopeEvidence lists the task's own worktrees, branches, and pull requests, and the parts of the pending action that a deterministic check found outside them. Treat each finding as a fact about the action. A finding's target belongs to other work unless the last direct user message names that target. A general request, such as to clean up, push, or merge, does not cover a target that it does not name.",
      },
      q2: {
        ...q2,
        instructions:
          "Is the push outbound?\nstate.scopeEvidence lists the task's own worktrees, branches, and pull requests, and the parts of the pending action that a deterministic check found outside them. Treat each finding as a fact about the action. A finding's target belongs to other work unless the last direct user message names that target. A general request, such as to clean up, push, or merge, does not cover a target that it does not name.",
      },
    },
  });
});
