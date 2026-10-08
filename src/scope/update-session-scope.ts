import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { toRepositorySlug } from '../containment/to-repository-slug.ts';
import { loadRepositoryContext } from '../model/load-repository-context.ts';
import { collectPullRequestAddresses } from './collect-pull-request-addresses.ts';
import { collectScopeEvents } from './collect-scope-events.ts';
import { findCheckout } from './find-checkout.ts';
import { loadCheckoutRemotes } from './load-checkout-remotes.ts';
import { mergeSessionScope } from './merge-session-scope.ts';
import { readBranchCreatedAt } from './read-branch-created-at.ts';
import type { PullRequestFacts } from './read-pull-request.ts';
import { resolveSessionScopePath } from './resolve-session-scope-path.ts';
import type { ScopeEvent, SessionScope } from './types.ts';
import { EMPTY_SESSION_SCOPE } from './types.ts';
import { writeSessionScope } from './write-session-scope.ts';

export interface ScopeRecordRequest {
  readonly sessionID: string;
  readonly cwd: string;
  readonly startedAt: number;
  readonly command: string;
  readonly resultText: string;
}

export interface ScopeRecordOptions {
  readonly now: number;
  readonly stateDir: string;
  readonly home: string;
  readonly readPullRequest: (
    repository: string,
    number: number,
  ) => Promise<PullRequestFacts | null>;
}

// A Bash call runs for at most ten minutes, so a record that claims an older
// start is not one the mod sent for a call that just finished.
const MAX_CALL_AGE_MS = 15 * 60_000;
const FUTURE_SLACK_MS = 60_000;

// The scope takes only what this call made: a worktree link file and a branch
// ref written after the call started, and a PR the forge dates from then.
// An existing worktree, branch, or PR adds nothing, whatever the command printed.
export async function updateSessionScope(
  request: Readonly<ScopeRecordRequest>,
  options: Readonly<ScopeRecordOptions>,
): Promise<SessionScope> {
  const age = options.now - request.startedAt;

  if (age < -FUTURE_SLACK_MS || age > MAX_CALL_AGE_MS) {
    return EMPTY_SESSION_SCOPE;
  }

  const events = collectScopeEvents(request.command, request.cwd, options.home);

  const verified = await Promise.all(
    events.map((event) => tryVerifyScopeEvent(event, request, options)),
  );

  const scope = mergeSessionScope(verified);

  if (scope.worktrees.length + scope.branches.length + scope.pullRequests.length > 0) {
    await writeSessionScope(resolveSessionScopePath(options.stateDir, request.sessionID), scope);
  }

  return scope;
}

async function tryVerifyScopeEvent(
  event: Readonly<ScopeEvent>,
  request: Readonly<ScopeRecordRequest>,
  options: Readonly<ScopeRecordOptions>,
): Promise<SessionScope> {
  try {
    return await verifyScopeEvent(event, request, options);
  } catch {
    return EMPTY_SESSION_SCOPE;
  }
}

// The forge's clock and this machine's can disagree by this much.
const FORGE_CLOCK_SKEW_MS = 60_000;

// Linux stamps files from a coarse clock that can trail Date.now() by a tick.
const FILE_CLOCK_SLACK_MS = 50;

async function verifyScopeEvent(
  event: Readonly<ScopeEvent>,
  request: Readonly<ScopeRecordRequest>,
  options: Readonly<ScopeRecordOptions>,
): Promise<SessionScope> {
  if (event.kind === 'worktree') {
    const link = await stat(join(event.path, '.git'));
    const checkout = await findCheckout(event.path);

    if (
      !link.isFile() ||
      link.mtimeMs < request.startedAt - FILE_CLOCK_SLACK_MS ||
      checkout?.worktree !== event.path
    ) {
      return EMPTY_SESSION_SCOPE;
    }

    const context = await loadRepositoryContext(event.path);

    const branch = context?.branch ?? null;

    if (branch === null) {
      return { ...EMPTY_SESSION_SCOPE, worktrees: [event.path] };
    }

    const isNew = await isBranchCreatedSince(checkout.commonDir, branch, request.startedAt);

    return {
      ...EMPTY_SESSION_SCOPE,
      worktrees: [event.path],
      branches: isNew ? [{ name: branch, commonDir: checkout.commonDir }] : [],
    };
  }

  const checkout = await findCheckout(event.directory);

  if (checkout === null) {
    return EMPTY_SESSION_SCOPE;
  }

  if (event.kind === 'branch') {
    const isNew = await isBranchCreatedSince(checkout.commonDir, event.name, request.startedAt);

    return isNew
      ? { ...EMPTY_SESSION_SCOPE, branches: [{ name: event.name, commonDir: checkout.commonDir }] }
      : EMPTY_SESSION_SCOPE;
  }

  const remotes = await loadCheckoutRemotes(checkout.commonDir);

  const repositories = new Set(remotes.map((remote) => toRepositorySlug(remote.url)));

  const addresses = collectPullRequestAddresses(request.resultText).filter((address) =>
    repositories.has(address.repository),
  );

  const pulls = await Promise.all(
    addresses.map(async (address) => {
      const pull = await options.readPullRequest(address.repository, address.number);

      const isNew = pull !== null && pull.createdAt >= request.startedAt - FORGE_CLOCK_SKEW_MS;

      return isNew ? [{ ...address, head: pull.head }] : [];
    }),
  );

  return { ...EMPTY_SESSION_SCOPE, pullRequests: pulls.flat() };
}

// The reflog dates a branch's creation to the second; the loose ref file the
// creation writes carries the millisecond, and only a later update moves it.
async function isBranchCreatedSince(
  commonDir: string,
  branch: string,
  since: number,
): Promise<boolean> {
  const createdAt = await readBranchCreatedAt(commonDir, branch);

  if (createdAt === null || createdAt < Math.floor(since / 1000) * 1000) {
    return false;
  }

  const ref = await stat(join(commonDir, 'refs', 'heads', branch)).catch(() => null);

  return ref !== null && ref.mtimeMs >= since - FILE_CLOCK_SLACK_MS;
}
