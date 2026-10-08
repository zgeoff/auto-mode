import type { OwnedScope, ScopeFinding } from '../containment/collect-scope-findings.ts';
import type { DecisionRequest } from '../model/types.ts';

export function buildScopeEvidenceRequest(
  request: DecisionRequest,
  scope: Readonly<OwnedScope>,
  findings: readonly ScopeFinding[],
): DecisionRequest {
  if (findings.length === 0) {
    return request;
  }

  const state = {
    ...request.state,
    scopeEvidence: {
      ownedWorktrees: scope.worktrees,
      ownedBranches: scope.branches,
      ownedPullRequests: scope.pullRequests.map((pull) => pull.number),
      findings,
    },
  };

  return { ...request, state, questions: buildEvidenceQuestions(request.questions) };
}

const SCOPE_EVIDENCE_INSTRUCTION =
  "state.scopeEvidence lists the task's own worktrees, branches, and pull requests, and the parts of the pending action that a deterministic check found outside them. Treat each finding as a fact about the action. A finding's target belongs to other work unless the last direct user message names that target. A general request, such as to clean up, push, or merge, does not cover a target that it does not name.";

function buildEvidenceQuestions(
  questions: DecisionRequest['questions'],
): DecisionRequest['questions'] {
  return Object.fromEntries(
    Object.entries(questions).map(([id, question]) => [
      id,
      { ...question, instructions: `${question.instructions}\n${SCOPE_EVIDENCE_INSTRUCTION}` },
    ]),
  );
}
