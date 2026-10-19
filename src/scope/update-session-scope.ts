import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { match } from 'ts-pattern';
import type { HostEnvironment } from '../config/types.ts';
import { loadCheckoutFacts } from '../git/load-checkout-facts.ts';
import { readBranchCreatedAt } from '../git/read-branch-created-at.ts';
import { readCheckout } from '../git/read-checkout.ts';
import { toRepositorySlug } from '../git/to-repository-slug.ts';
import type { ScopeRecordRequest } from '../request/types.ts';
import type { LockClock } from '../state/types.ts';
import { collectPullRequestAddresses } from './collect-pull-request-addresses.ts';
import { collectScopeEvents } from './collect-scope-events.ts';
import { mergeSessionScope } from './merge-session-scope.ts';
import type { PullRequestFacts } from './read-pull-request.ts';
import { resolveSessionScopePath } from './resolve-session-scope-path.ts';
import type { ScopeEvent, SessionScope } from './types.ts';
import { EMPTY_SESSION_SCOPE } from './types.ts';
import { writeSessionScope } from './write-session-scope.ts';

type ScopeEventVerifier = (
  event: Readonly<ScopeEvent>,
  request: Readonly<ScopeRecordRequest>,
) => Promise<SessionScope>;

export interface ScopeRecordOptions {
  readonly now: number;
  readonly stateDir: string;
  readonly home: string;
  readonly env: HostEnvironment['env'];
  readonly readPullRequest: (
    repository: string,
    number: number,
  ) => Promise<PullRequestFacts | null>;
  readonly lockClock?: LockClock | undefined;
  readonly verifyEvent?: ScopeEventVerifier | undefined;
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
    await writeSessionScope(
      resolveSessionScopePath(options.stateDir, request.sessionID),
      scope,
      options.lockClock,
    );
  }

  return scope;
}

async function tryVerifyScopeEvent(
  event: Readonly<ScopeEvent>,
  request: Readonly<ScopeRecordRequest>,
  options: Readonly<ScopeRecordOptions>,
): Promise<SessionScope> {
  try {
    return await (options.verifyEvent === undefined
      ? verifyScopeEvent(event, request, options)
      : options.verifyEvent(event, request));
  } catch {
    return EMPTY_SESSION_SCOPE;
  }
}

function verifyScopeEvent(
  event: Readonly<ScopeEvent>,
  request: Readonly<ScopeRecordRequest>,
  options: Readonly<ScopeRecordOptions>,
): Promise<SessionScope> {
  return match(event)
    .returnType<Promise<SessionScope>>()
    .with({ kind: 'worktree' }, (worktree) => verifyWorktreeEvent(worktree.path, request, options))
    .with({ kind: 'branch' }, (branch) => verifyBranchEvent(branch, request, options))
    .with({ kind: 'pull-request' }, (pull) =>
      verifyPullRequestEvent(pull.directory, request, options),
    )
    .exhaustive();
}

// Linux stamps files from a coarse clock that can trail Date.now() by a tick.
const FILE_CLOCK_SLACK_MS = 50;

async function verifyWorktreeEvent(
  path: string,
  request: Readonly<ScopeRecordRequest>,
  options: Readonly<ScopeRecordOptions>,
): Promise<SessionScope> {
  const link = await stat(join(path, '.git'));
  const facts = await loadCheckoutFacts(path, options.env);

  const checkout = facts.checkout;

  if (
    !link.isFile() ||
    link.mtimeMs < request.startedAt - FILE_CLOCK_SLACK_MS ||
    checkout?.worktree !== path
  ) {
    return EMPTY_SESSION_SCOPE;
  }

  const branch = facts.head?.branch ?? null;

  if (branch === null) {
    return { ...EMPTY_SESSION_SCOPE, worktrees: [path] };
  }

  const isNew = await probeBranchCreatedSince(checkout.commonDir, branch, request.startedAt);

  return {
    ...EMPTY_SESSION_SCOPE,
    worktrees: [path],
    branches: isNew ? [{ name: branch, commonDir: checkout.commonDir }] : [],
  };
}

// The reflog dates a branch's creation to the second; the loose ref file the
// creation writes carries the millisecond, and only a later update moves it.
async function probeBranchCreatedSince(
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

async function verifyBranchEvent(
  event: Readonly<Extract<ScopeEvent, { kind: 'branch' }>>,
  request: Readonly<ScopeRecordRequest>,
  options: Readonly<ScopeRecordOptions>,
): Promise<SessionScope> {
  const checkout = await readCheckout(event.directory, options.env);

  if (checkout === null) {
    return EMPTY_SESSION_SCOPE;
  }

  const isNew = await probeBranchCreatedSince(checkout.commonDir, event.name, request.startedAt);

  return isNew
    ? { ...EMPTY_SESSION_SCOPE, branches: [{ name: event.name, commonDir: checkout.commonDir }] }
    : EMPTY_SESSION_SCOPE;
}

// The forge's clock and this machine's can disagree by this much.
const FORGE_CLOCK_SKEW_MS = 60_000;

async function verifyPullRequestEvent(
  directory: string,
  request: Readonly<ScopeRecordRequest>,
  options: Readonly<ScopeRecordOptions>,
): Promise<SessionScope> {
  const facts = await loadCheckoutFacts(directory, options.env);

  if (facts.checkout === null) {
    return EMPTY_SESSION_SCOPE;
  }

  const repositories = new Set(facts.remotes.map((remote) => toRepositorySlug(remote.url)));

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
