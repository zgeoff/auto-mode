import type { Config } from './config/config.ts';
import { DEFAULT_SCOPE_SOURCES } from './config/config.ts';
import type { Runtime } from './config/types.ts';
import type { ScopeRecordRequest } from './request/types.ts';
import { readPullRequest } from './scope/read-pull-request.ts';
import type { SessionScope } from './scope/types.ts';
import { EMPTY_SESSION_SCOPE } from './scope/types.ts';
import { updateSessionScope } from './scope/update-session-scope.ts';
import { resolveXDGDir } from './state/resolve-xdg-dir.ts';

export async function recordScope(
  request: Readonly<ScopeRecordRequest>,
  config: Readonly<Config>,
  runtime: Readonly<Runtime>,
): Promise<SessionScope> {
  const host = runtime.host;
  const sources = Object.values(config.scopeSources ?? DEFAULT_SCOPE_SOURCES);

  if (!sources.some((source) => source.kind === 'session')) {
    return EMPTY_SESSION_SCOPE;
  }

  const recorded = await updateSessionScope(request, {
    now: runtime.now(),
    stateDir: resolveXDGDir(host, 'state'),
    home: host.home,
    env: host.env,
    readPullRequest,
  });

  return recorded;
}
