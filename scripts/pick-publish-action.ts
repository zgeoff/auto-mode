import * as z from 'zod';
import type { ProgramResult } from './run-program.ts';

export interface PublishFacts {
  // The package.json name and version at the commit the run checked out.
  readonly name: string;
  readonly version: string;

  readonly tag: string;

  // `npm view <name>@<version> version --json`.
  readonly registry: ProgramResult;

  // `git ls-remote --exit-code --tags origin refs/tags/<tag>`.
  readonly tagLookup: ProgramResult;
}

export type PublishAction =
  | { readonly kind: 'publish'; readonly reason: string }
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

  if (facts.tagLookup.exitCode !== 0) {
    return {
      kind: 'fail',
      reason: `git ls-remote for ${facts.tag} failed: ${formatOutput(facts.tagLookup)}`,
    };
  }

  return { kind: 'publish', reason: `${spec} is tagged ${facts.tag} and missing from npm` };
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
