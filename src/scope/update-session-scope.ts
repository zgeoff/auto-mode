import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { toRepositorySlug } from '../containment/to-repository-slug.ts';
import { loadRepositoryContext } from '../model/load-repository-context.ts';
import { collectScopeEvents } from './collect-scope-events.ts';
import { findCheckout } from './find-checkout.ts';
import { loadCheckoutRemotes } from './load-checkout-remotes.ts';
import { mergeScopeFacts } from './merge-scope-facts.ts';
import { parsePullRequestAddress } from './parse-pull-request-address.ts';
import { readBranchCreatedAt } from './read-branch-created-at.ts';
import { resolveSessionScopePath } from './resolve-session-scope-path.ts';
import type { ScopeEvent, ScopeFacts } from './types.ts';
import { EMPTY_SCOPE_FACTS } from './types.ts';
import { writeSessionScope } from './write-session-scope.ts';

export interface ScopeRecordRequest {
  readonly sessionID: string;
  readonly cwd: string;
  readonly startedAt: number;
  readonly command: string;
  readonly resultText: string;
}

export interface ScopeRecordOptions {
  readonly stateDir: string;
  readonly home: string;
  readonly readPullRequestHead: (repository: string, number: number) => Promise<string | null>;
}

// The scope takes only what this call made: a worktree link file and a branch
// reflog that start after the call did, and a PR with the head the forge
// reports. An existing worktree or branch, or another PR's address, adds nothing.
export async function updateSessionScope(
  request: Readonly<ScopeRecordRequest>,
  options: Readonly<ScopeRecordOptions>,
): Promise<ScopeFacts> {
  const events = collectScopeEvents(request.command, request.cwd, options.home);

  const confirmed = await Promise.all(
    events.map((event) => tryVerifyScopeEvent(event, request, options)),
  );

  const facts = mergeScopeFacts(confirmed);

  if (facts.worktrees.length + facts.branches.length + facts.pullRequests.length > 0) {
    await writeSessionScope(resolveSessionScopePath(options.stateDir, request.sessionID), facts);
  }

  return facts;
}

async function tryVerifyScopeEvent(
  event: Readonly<ScopeEvent>,
  request: Readonly<ScopeRecordRequest>,
  options: Readonly<ScopeRecordOptions>,
): Promise<ScopeFacts> {
  try {
    return await verifyScopeEvent(event, request, options);
  } catch {
    return EMPTY_SCOPE_FACTS;
  }
}

// Reflog times have whole-second resolution.
const CLOCK_SLACK_MS = 1000;

async function verifyScopeEvent(
  event: Readonly<ScopeEvent>,
  request: Readonly<ScopeRecordRequest>,
  options: Readonly<ScopeRecordOptions>,
): Promise<ScopeFacts> {
  const since = Math.floor(request.startedAt / 1000) * 1000 - CLOCK_SLACK_MS;

  if (event.kind === 'worktree') {
    const link = await stat(join(event.path, '.git'));
    const checkout = await findCheckout(event.path);

    if (!link.isFile() || link.mtimeMs < since || checkout?.worktree !== event.path) {
      return EMPTY_SCOPE_FACTS;
    }

    const context = await loadRepositoryContext(event.path);

    const branch = context?.branch ?? null;

    const createdAt =
      branch === null ? null : await readBranchCreatedAt(checkout.commonDir, branch);

    return {
      ...EMPTY_SCOPE_FACTS,
      worktrees: [event.path],
      branches: branch !== null && createdAt !== null && createdAt >= since ? [branch] : [],
    };
  }

  const checkout = await findCheckout(event.directory);

  if (checkout === null) {
    return EMPTY_SCOPE_FACTS;
  }

  if (event.kind === 'branch') {
    const createdAt = await readBranchCreatedAt(checkout.commonDir, event.name);

    return createdAt !== null && createdAt >= since
      ? { ...EMPTY_SCOPE_FACTS, branches: [event.name] }
      : EMPTY_SCOPE_FACTS;
  }

  const address = parsePullRequestAddress(request.resultText);

  const remotes = await loadCheckoutRemotes(checkout.commonDir);

  if (
    address === null ||
    !remotes.some((remote) => toRepositorySlug(remote.url) === address.repository)
  ) {
    return EMPTY_SCOPE_FACTS;
  }

  const head = await options.readPullRequestHead(address.repository, address.number);

  return head === null
    ? EMPTY_SCOPE_FACTS
    : {
        ...EMPTY_SCOPE_FACTS,
        pullRequests: [{ number: address.number, head, repository: address.repository }],
      };
}
