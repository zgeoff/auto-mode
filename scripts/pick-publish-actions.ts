import * as z from 'zod';
import type { ProgramResult } from './run-program.ts';

export interface PublishFacts {
  readonly name: string;

  // The commit the run checked out.
  readonly head: string;

  // npm provenance records the run's own commit as the package's source, so only a run whose
  // checks passed on the tagged commit publishes; any other run hands the tag to a run at the tag.
  readonly canPublishHere: boolean;

  // `npm view <name> versions dist-tags --json`.
  readonly registry: ProgramResult;

  // `git ls-remote --tags origin refs/tags/<name>-v*`.
  readonly tagListing: ProgramResult;
}

export type PublishAction =
  | { readonly kind: 'publish'; readonly tag: string; readonly reason: string }
  | { readonly kind: 'dispatch'; readonly tag: string; readonly reason: string }
  | { readonly kind: 'skip'; readonly reason: string }
  | { readonly kind: 'fail'; readonly reason: string };

const registrySchema = z.object({
  versions: z.array(z.string()),
  'dist-tags': z.object({ latest: z.string() }),
});

// Only a tag newer than npm's latest is pending: npm publish moves latest to the version it
// publishes, so an older tag that never shipped stays for a person to publish under another tag.
export function pickPublishActions(facts: Readonly<PublishFacts>): PublishAction[] {
  const registry = registrySchema.safeParse(parseJSON(facts.registry.stdout));

  if (facts.registry.exitCode !== 0 || !registry.success) {
    return [
      { kind: 'fail', reason: `npm view ${facts.name} failed: ${formatOutput(facts.registry)}` },
    ];
  }

  if (facts.tagListing.exitCode !== 0) {
    return [
      {
        kind: 'fail',
        reason: `git ls-remote for ${facts.name} tags failed: ${formatOutput(facts.tagListing)}`,
      },
    ];
  }

  const latest = registry.data['dist-tags'].latest;

  const published = new Set(registry.data.versions);

  const pending = collectReleaseTags(facts.name, facts.tagListing.stdout).filter(
    (release) => !published.has(release.version) && Bun.semver.order(release.version, latest) > 0,
  );

  if (pending.length === 0) {
    return [
      {
        kind: 'skip',
        reason: `no ${facts.name} release tag newer than ${latest} is missing from npm`,
      },
    ];
  }

  return pending.map((release) =>
    facts.canPublishHere && release.commit === facts.head
      ? {
          kind: 'publish',
          tag: release.tag,
          reason: `${facts.name}@${release.version} is missing from npm, and ${release.tag} is this run's commit`,
        }
      : {
          kind: 'dispatch',
          tag: release.tag,
          reason: `${facts.name}@${release.version} is missing from npm, so a run at ${release.tag} (${release.commit}) publishes it`,
        },
  );
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

interface ReleaseTag {
  readonly tag: string;
  readonly version: string;
  readonly commit: string;
}

// release-please tags a node package <name>-v<version>. An annotated tag lists the tag object on
// its own ref and the commit on the peeled ^{} ref; a lightweight tag, which a GitHub release
// creates, lists only the commit.
function collectReleaseTags(name: string, listing: string): ReleaseTag[] {
  const commits = new Map<string, string>();

  for (const line of listing.split('\n').filter((entry) => entry !== '')) {
    const [sha = '', ref = ''] = line.split('\t');
    const peeled = ref.endsWith('^{}');
    const tag = ref.replace(/^refs\/tags\//u, '').replace(/\^\{\}$/u, '');

    if (peeled || !commits.has(tag)) {
      commits.set(tag, sha);
    }
  }

  const prefix = `${name}-v`;

  return [...commits]
    .map(([tag, commit]) => ({ tag, version: tag.slice(prefix.length), commit }))
    .filter((release) => release.tag.startsWith(prefix) && /^\d+\.\d+\.\d+$/u.test(release.version))
    .toSorted((left, right) => Bun.semver.order(left.version, right.version));
}
