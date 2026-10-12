import { resolve } from 'node:path';
import type { ScopeSource } from '../config/config.ts';
import type { HostEnvironment, OutputStream } from '../config/types.ts';
import { loadCheckoutFacts } from '../git/load-checkout-facts.ts';
import type { CheckoutFacts, CheckoutFinder } from '../git/types.ts';
import { buildTaskScope } from './build-task-scope.ts';
import { pickScopeSourceReader } from './pick-scope-source-reader.ts';
import type { OwnedScope } from './types.ts';

export interface TaskScopeRequest {
  readonly sessionID: string;
  readonly cwd: string;
  readonly stateDir: string;
  readonly checkout?: CheckoutFacts | undefined;
  readonly findCheckout?: CheckoutFinder | undefined;
}

// The union of every configured source. The checkout supplies the facts no
// source decides: the current branch, the default branch, and the remotes.
export async function loadTaskScope(
  request: Readonly<TaskScopeRequest>,
  sources: Readonly<Record<string, ScopeSource>>,
  host: Readonly<HostEnvironment>,
  stderr: Readonly<OutputStream>,
): Promise<OwnedScope> {
  const cwd = resolve(request.cwd);

  const facts = await (request.checkout ??
    loadCheckoutFacts(cwd, host.env, { findCheckout: request.findCheckout }));

  const checkout = facts.checkout;
  const branch = facts.head?.branch ?? null;

  const sourceContext = {
    env: host.env,
    sessionID: request.sessionID,
    cwd,
    worktree: checkout?.worktree ?? cwd,
    commonDir: checkout?.commonDir ?? null,
    branch,
    stateDir: request.stateDir,
    atcRecordPath: host.env['ATC_SESSION_RECORD'],
    atcSessionID: host.env['ATC_SESSION_ID'],
    stderr,
  };

  const sourceFacts = await Promise.all(
    Object.values(sources).map((source) =>
      pickScopeSourceReader(source, request.findCheckout)(sourceContext),
    ),
  );

  return buildTaskScope({
    home: host.home,
    currentBranch: branch,
    defaultBranch: facts.head?.defaultBranch ?? null,
    remotes: facts.remotes,
    facts: sourceFacts,
  });
}
