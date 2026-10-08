import { collectPullRequestAddresses } from '../../src/scope/collect-pull-request-addresses.ts';
import type { ScopeEvent, SessionScope } from '../../src/scope/types.ts';
import { EMPTY_SESSION_SCOPE } from '../../src/scope/types.ts';

export interface ScopeRecording {
  readonly commonDir: string;
  readonly worktreeBranches: Readonly<Record<string, string>>;
  readonly pullRequestHeads: Readonly<Record<string, string>>;
}

// Stands in for the checkout and the forge that confirm what a recorded call
// made: every event the call claims is new, a worktree holds the branch the
// recording names for it, and a PR is the first one the call printed.
export function buildStubSessionScope(
  event: Readonly<ScopeEvent>,
  resultText: string,
  recording: Readonly<ScopeRecording>,
): SessionScope {
  if (event.kind === 'worktree') {
    const branch = recording.worktreeBranches[event.path];

    return {
      ...EMPTY_SESSION_SCOPE,
      worktrees: [event.path],
      branches: branch === undefined ? [] : [{ name: branch, commonDir: recording.commonDir }],
    };
  }

  if (event.kind === 'branch') {
    return {
      ...EMPTY_SESSION_SCOPE,
      branches: [{ name: event.name, commonDir: recording.commonDir }],
    };
  }

  const address = collectPullRequestAddresses(resultText).at(0);

  const head =
    address === undefined ? undefined : recording.pullRequestHeads[String(address.number)];

  return address === undefined || head === undefined
    ? EMPTY_SESSION_SCOPE
    : { ...EMPTY_SESSION_SCOPE, pullRequests: [{ ...address, head }] };
}
