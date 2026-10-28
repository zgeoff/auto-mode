import { resolve } from 'node:path';
import type { ScopeSource } from '../config/config.ts';
import type { HostEnvironment, OutputStream, TextFileReader } from '../config/types.ts';
import { loadCheckoutFacts } from '../git/load-checkout-facts.ts';
import type { CheckoutFacts, CheckoutReader } from '../git/types.ts';
import { buildTaskScope } from './build-task-scope.ts';
import { makeScopeSourceReader } from './make-scope-source-reader.ts';
import type { OwnedScope } from './types.ts';

export interface TaskScopeRequest {
  readonly sessionID: string;
  readonly cwd: string;
  readonly stateDir: string;
  readonly protectedBranches?: readonly string[] | undefined;
  readonly checkout?: CheckoutFacts | undefined;
  readonly readCheckout?: CheckoutReader | undefined;
  readonly readTextFile: TextFileReader;
}

export async function loadTaskScope(
  request: Readonly<TaskScopeRequest>,
  sources: Readonly<Record<string, ScopeSource>>,
  host: Readonly<HostEnvironment>,
  stderr: Readonly<OutputStream>,
): Promise<OwnedScope> {
  const cwd = resolve(request.cwd);

  const facts = await (request.checkout ??
    loadCheckoutFacts(cwd, host.env, { readCheckout: request.readCheckout }));

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
    scopeFilePath: host.env['AUTO_MODE_SCOPE_FILE'],
    readTextFile: request.readTextFile,
    stderr,
  };

  const sourceFacts = await Promise.all(
    Object.values(sources).map((source) =>
      makeScopeSourceReader(source, request.readCheckout)(sourceContext),
    ),
  );

  return buildTaskScope({
    home: host.home,
    currentBranch: branch,
    defaultBranch: facts.head?.defaultBranch ?? null,
    protectedBranches: request.protectedBranches,
    remotes: facts.remotes,
    facts: sourceFacts,
  });
}
