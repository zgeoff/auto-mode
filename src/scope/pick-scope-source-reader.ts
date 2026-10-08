import type { ScopeSource } from '../config/config.ts';
import type { HostEnvironment } from '../config/types.ts';
import { buildAtcScopeFacts } from './build-atc-scope-facts.ts';
import { findCheckout } from './find-checkout.ts';
import { loadAtcSessionRecord } from './load-atc-session-record.ts';
import { loadSessionScope } from './load-session-scope.ts';
import { resolveSessionScopePath } from './resolve-session-scope-path.ts';
import type { ScopeFacts, ScopeSourceReader } from './types.ts';
import { EMPTY_SCOPE_FACTS } from './types.ts';

// Each source answers from the action's context alone and never throws: a
// source with nothing to say contributes no facts.
export function pickScopeSourceReader(source: Readonly<ScopeSource>): ScopeSourceReader {
  if (source.kind === 'cwd') {
    return (context) =>
      Promise.resolve(
        buildFacts({
          worktrees: [context.worktree],
          branches: context.branch === null ? [] : [context.branch],
        }),
      );
  }

  if (source.kind === 'session') {
    return async (context) => {
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
    };
  }

  if (source.kind === 'globs') {
    return () => Promise.resolve(buildFacts({ pathGlobs: source.paths ?? [] }));
  }

  return async (context) => {
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
      [...paths].map((path) => findCommonDirEntry(path, context.env)),
    );

    const commonDirs = new Map(entries);

    return buildAtcScopeFacts(
      loaded.record,
      (path) => context.commonDir !== null && commonDirs.get(path) === context.commonDir,
    );
  };
}

async function findCommonDirEntry(
  path: string,
  env: HostEnvironment['env'],
): Promise<readonly [string, string | null]> {
  const checkout = await findCheckout(path, env);

  return [path, checkout?.commonDir ?? null];
}

function buildFacts(facts: Partial<ScopeFacts>): ScopeFacts {
  return { ...EMPTY_SCOPE_FACTS, ...facts };
}
