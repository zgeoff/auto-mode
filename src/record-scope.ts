import type { Config } from './config/config.ts';
import { DEFAULT_SCOPE_SOURCES } from './config/config.ts';
import { readHostEnvironment } from './config/read-host-environment.ts';
import type { HostEnvironment } from './config/types.ts';
import type { ScopeRecordRequest } from './request/types.ts';
import { readPullRequest } from './scope/read-pull-request.ts';
import type { SessionScope } from './scope/types.ts';
import { EMPTY_SESSION_SCOPE } from './scope/types.ts';
import { updateSessionScope } from './scope/update-session-scope.ts';
import { resolveXDGDir } from './state/resolve-xdg-dir.ts';

export interface RecordScopeOptions {
  readonly host?: Readonly<HostEnvironment>;
  readonly now?: number;
}

export async function recordScope(
  request: Readonly<ScopeRecordRequest>,
  config: Readonly<Config>,
  options: Readonly<RecordScopeOptions> = {},
): Promise<SessionScope> {
  const host = options.host ?? readHostEnvironment();
  const sources = Object.values(config.scopeSources ?? DEFAULT_SCOPE_SOURCES);

  if (!sources.some((source) => source.kind === 'session')) {
    return EMPTY_SESSION_SCOPE;
  }

  return await updateSessionScope(request, {
    now: options.now ?? Date.now(),
    stateDir: resolveXDGDir(host, 'state'),
    home: host.home,
    env: host.env,
    readPullRequest,
  });
}
