import { EMPTY_SESSION_SCOPE, collectPullRequestAddresses } from 'auto-mode/eval';
import type { ScopeEvent, SessionScope } from 'auto-mode/eval';

export interface ScopeRecording {
  readonly commonDir: string;
  readonly worktreeBranches: Readonly<Record<string, string>>;
  readonly pullRequestHeads: Readonly<Record<string, string>>;
}

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
