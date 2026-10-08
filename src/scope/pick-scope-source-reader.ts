import type { ScopeSource } from '../config/config.ts';
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

  return () => Promise.resolve(EMPTY_SCOPE_FACTS);
}

function buildFacts(facts: Partial<ScopeFacts>): ScopeFacts {
  return { ...EMPTY_SCOPE_FACTS, ...facts };
}
