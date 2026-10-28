import { match } from 'ts-pattern';
import type { ScopeSource } from '../config/config.ts';
import type { HostEnvironment } from '../config/types.ts';
import { readCheckout } from '../git/read-checkout.ts';
import type { CheckoutReader } from '../git/types.ts';
import { buildDeclaredScopeFacts } from './build-declared-scope-facts.ts';
import { loadAtcSessionRecord } from './load-atc-session-record.ts';
import { loadScopeFile } from './load-scope-file.ts';
import { loadSessionScope } from './load-session-scope.ts';
import { resolveSessionScopePath } from './resolve-session-scope-path.ts';
import type { DeclaredScope, ScopeFacts, ScopeSourceContext, ScopeSourceReader } from './types.ts';
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
    .with('launcher', () => (context) => readLauncherScopeFacts(context, readSourceCheckout))
    .with('atc', () => (context) => readAtcScopeFacts(context, readSourceCheckout))
    .exhaustive();
}

function buildFacts(facts: Partial<ScopeFacts>): ScopeFacts {
  return { ...EMPTY_SCOPE_FACTS, ...facts };
}

async function readLauncherScopeFacts(
  context: Readonly<ScopeSourceContext>,
  readSourceCheckout: CheckoutReader,
): Promise<ScopeFacts> {
  const loaded = await loadScopeFile(context.scopeFilePath);

  if (loaded.kind === 'malformed') {
    context.stderr.write(`auto-mode: ${loaded.diagnostic}\n`);
  }

  if (loaded.kind !== 'scope') {
    return EMPTY_SCOPE_FACTS;
  }

  const facts = await readDeclaredScopeFacts(loaded.scope, context, readSourceCheckout);

  return { ...facts, paths: loaded.scope.paths, replyChannels: loaded.scope.replyChannels };
}

async function readDeclaredScopeFacts(
  scope: Readonly<DeclaredScope>,
  context: Readonly<ScopeSourceContext>,
  readSourceCheckout: CheckoutReader,
): Promise<ScopeFacts> {
  const workspace = scope.workspace?.path;

  const paths = new Set([
    ...(workspace === undefined ? [] : [workspace]),
    ...scope.worktrees.map((worktree) => worktree.path),
    ...scope.branches.flatMap((branch) => {
      const repo = branch.repo ?? workspace;

      return repo === undefined ? [] : [repo];
    }),
  ]);

  const entries = await Promise.all(
    [...paths].map((path) => readCommonDirEntry(path, context.env, readSourceCheckout)),
  );

  const commonDirs = new Map(entries);

  return buildDeclaredScopeFacts(
    scope,
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

  return readDeclaredScopeFacts(loaded.record.scope, context, readSourceCheckout);
}
