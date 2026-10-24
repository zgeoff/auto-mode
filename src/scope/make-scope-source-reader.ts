import { match } from 'ts-pattern';
import type { ScopeSource } from '../config/config.ts';
import type { HostEnvironment } from '../config/types.ts';
import { readCheckout } from '../git/read-checkout.ts';
import type { CheckoutReader } from '../git/types.ts';
import { buildAtcScopeFacts } from './build-atc-scope-facts.ts';
import { loadAtcSessionRecord } from './load-atc-session-record.ts';
import { loadSessionScope } from './load-session-scope.ts';
import { resolveSessionScopePath } from './resolve-session-scope-path.ts';
import type { ScopeFacts, ScopeSourceContext, ScopeSourceReader } from './types.ts';
import { EMPTY_SCOPE_FACTS } from './types.ts';

export function makeScopeSourceReader(
  source: Readonly<ScopeSource>,
  readSourceCheckout: CheckoutReader = readCheckout,
): ScopeSourceReader {
  return match(source.kind)
    .returnType<ScopeSourceReader>()
    .with(
      'cwd',
      () => (context) =>
        Promise.resolve(
          buildFacts({
            worktrees: [context.worktree],
            branches: context.branch === null ? [] : [context.branch],
          }),
        ),
    )
    .with('session', () => async (context) => {
      const scope = await loadSessionScope(
        resolveSessionScopePath(context.stateDir, context.sessionID),
      );

      return buildFacts({
        worktrees: scope.worktrees,
        branches: scope.branches
          .filter((branch) => branch.commonDir === context.commonDir)
          .map((branch) => branch.name),
        pullRequests: scope.pullRequests,
      });
    })
    .with('globs', () => () => Promise.resolve(buildFacts({ pathGlobs: source.paths ?? [] })))
    .with('atc', () => (context) => readAtcScopeFacts(context, readSourceCheckout))
    .exhaustive();
}

function buildFacts(facts: Partial<ScopeFacts>): ScopeFacts {
  return { ...EMPTY_SCOPE_FACTS, ...facts };
}

async function readAtcScopeFacts(
  context: Readonly<ScopeSourceContext>,
  readSourceCheckout: CheckoutReader,
): Promise<ScopeFacts> {
  const loaded = await loadAtcSessionRecord(context.atcRecordPath, context.atcSessionID);

  if (loaded.kind === 'malformed') {
    context.stderr.write(`auto-mode: ${loaded.diagnostic}\n`);
  }

  if (loaded.kind !== 'record') {
    return EMPTY_SCOPE_FACTS;
  }

  const scope = loaded.record.scope;

  const paths = new Set([
    scope.workspace.path,
    ...scope.worktrees.map((worktree) => worktree.path),
    ...scope.branches.map((branch) => branch.repo ?? scope.workspace.path),
  ]);

  const entries = await Promise.all(
    [...paths].map((path) => readCommonDirEntry(path, context.env, readSourceCheckout)),
  );

  const commonDirs = new Map(entries);

  return buildAtcScopeFacts(
    loaded.record,
    (path) => context.commonDir !== null && commonDirs.get(path) === context.commonDir,
  );
}

async function readCommonDirEntry(
  path: string,
  env: HostEnvironment['env'],
  readSourceCheckout: CheckoutReader,
): Promise<readonly [string, string | null]> {
  const checkout = await readSourceCheckout(path, env);

  return [path, checkout?.commonDir ?? null];
}
