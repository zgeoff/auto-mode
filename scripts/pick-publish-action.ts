import * as z from 'zod';
import type { ProgramResult } from './run-program.ts';

export interface PublishFacts {
  readonly name: string;
  readonly version: string;
  readonly tag: string;

  // The commit the run checked out.
  readonly head: string;

  // npm provenance names the run's own commit as the package's source, so only a run whose checks
  // passed on the tagged commit publishes; any other run hands the tag to a run at the tag.
  readonly canPublishHere: boolean;

  // `npm view <name>@<version> version --json`.
  readonly registry: ProgramResult;

  // `git ls-remote --exit-code origin refs/tags/<tag> refs/tags/<tag>^{}`.
  readonly tagLookup: ProgramResult;
}

export type PublishAction =
  | { readonly kind: 'publish'; readonly reason: string }
  | { readonly kind: 'dispatch'; readonly reason: string }
  | { readonly kind: 'skip'; readonly reason: string }
  | { readonly kind: 'fail'; readonly reason: string };

export function pickPublishAction(facts: Readonly<PublishFacts>): PublishAction {
  const spec = `${facts.name}@${facts.version}`;
  const registry = classifyRegistryAnswer(facts.version, facts.registry);

  if (registry === 'published') {
    return { kind: 'skip', reason: `${spec} is already on npm` };
  }

  if (registry === 'unknown') {
    return { kind: 'fail', reason: `npm view ${spec} failed: ${formatOutput(facts.registry)}` };
  }

  // ls-remote --exit-code exits 2 when no ref matches.
  if (facts.tagLookup.exitCode === 2) {
    return { kind: 'skip', reason: `${spec} is missing from npm, but no ${facts.tag} tag exists` };
  }

  const commit = findTaggedCommit(facts.tag, facts.tagLookup.stdout);

  if (facts.tagLookup.exitCode !== 0 || commit === undefined) {
    return {
      kind: 'fail',
      reason: `git ls-remote for ${facts.tag} failed: ${formatOutput(facts.tagLookup)}`,
    };
  }

  if (facts.canPublishHere && commit === facts.head) {
    return {
      kind: 'publish',
      reason: `${spec} is missing from npm, and ${facts.tag} is this run's commit`,
    };
  }

  return {
    kind: 'dispatch',
    reason: `${spec} is missing from npm, so a run at ${facts.tag} (${commit}) publishes it`,
  };
}

const npmErrorSchema = z.object({ error: z.object({ code: z.string() }) });

// npm 11 answers a version the registry lacks with exit 1 and an E404 error object on stdout,
// the same exit as a registry it cannot reach.
function classifyRegistryAnswer(
  version: string,
  registry: ProgramResult,
): 'published' | 'missing' | 'unknown' {
  const answer = parseJSON(registry.stdout);

  if (registry.exitCode === 0) {
    return answer === version ? 'published' : 'unknown';
  }

  const error = npmErrorSchema.safeParse(answer);

  return error.success && error.data.error.code === 'E404' ? 'missing' : 'unknown';
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function formatOutput(result: ProgramResult): string {
  const output = [result.stderr.trim(), result.stdout.trim()].filter((text) => text !== '');

  return `exit ${result.exitCode}${output.length === 0 ? '' : `: ${output.join('\n')}`}`;
}

// An annotated tag lists the tag object on its own ref and the commit on the peeled ^{} ref; a
// lightweight tag, which a GitHub release creates, lists only the commit.
function findTaggedCommit(tag: string, listing: string): string | undefined {
  const refs = new Map(
    listing
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => {
        const [sha = '', ref = ''] = line.split('\t');

        return [ref, sha];
      }),
  );

  return refs.get(`refs/tags/${tag}^{}`) ?? refs.get(`refs/tags/${tag}`);
}
