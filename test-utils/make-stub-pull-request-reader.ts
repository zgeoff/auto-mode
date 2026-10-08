import type { PullRequestFacts } from '../src/scope/read-pull-request.ts';

export interface StubPullRequest extends PullRequestFacts {
  readonly repository: string;
  readonly number: number;
}

// Stands in for `gh pr view`: the forge answers for the pull requests it holds,
// keyed by repository and number, and knows no other.
export function makeStubPullRequestReader(
  pulls: readonly StubPullRequest[],
): (repository: string, number: number) => Promise<PullRequestFacts | null> {
  return (repository, number) => {
    const pull = pulls.find((entry) => entry.repository === repository && entry.number === number);
    const facts = pull === undefined ? null : { head: pull.head, createdAt: pull.createdAt };

    return Promise.resolve(facts);
  };
}
