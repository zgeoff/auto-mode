import { resolve } from 'node:path';
import type { ScopeSource } from '../config/config.ts';
import type { HostEnvironment } from '../config/types.ts';
import type { OwnedScope } from '../containment/collect-scope-findings.ts';
import { loadRepositoryContext } from '../model/load-repository-context.ts';
import { buildTaskScope } from './build-task-scope.ts';
import { findCheckout } from './find-checkout.ts';
import { loadCheckoutRemotes } from './load-checkout-remotes.ts';
import { pickScopeSourceReader } from './pick-scope-source-reader.ts';

export interface TaskScopeRequest {
  readonly sessionID: string;
  readonly cwd: string;
  readonly stateDir: string;
}

// The union of every configured source. The checkout supplies the facts no
// source decides: the current branch, the default branch, and the remotes.
export async function loadTaskScope(
  request: Readonly<TaskScopeRequest>,
  sources: Readonly<Record<string, ScopeSource>>,
  host: Readonly<HostEnvironment>,
): Promise<OwnedScope> {
  const cwd = resolve(request.cwd);

  const [checkout, context] = await Promise.all([
    findCheckout(cwd, host.env),
    loadRepositoryContext(cwd, host.env),
  ]);

  const branch = context?.branch ?? null;

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
  };

  const [remotes, ...facts] = await Promise.all([
    checkout === null ? [] : loadCheckoutRemotes(checkout.commonDir),
    ...Object.values(sources).map((source) => pickScopeSourceReader(source)(sourceContext)),
  ]);

  return buildTaskScope({
    home: host.home,
    currentBranch: branch,
    defaultBranch: context?.defaultBranch ?? null,
    remotes,
    facts,
  });
}
