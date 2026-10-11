import { runCapped } from '../process/run-capped.ts';

export interface PullRequestFacts {
  readonly head: string;
  readonly createdAt: number;
}

interface ReadPullRequestOptions {
  readonly command?: readonly [string, ...string[]];
  readonly timeoutMs?: number;
}

const LOOKUP_TIMEOUT_MS = 5000;
const MAX_LOOKUP_OUTPUT_BYTES = 65_536;

// `repository` is `host/owner/name`, which `gh --repo` accepts as written.
export async function readPullRequest(
  repository: string,
  number: number,
  options: Readonly<ReadPullRequestOptions> = {},
): Promise<PullRequestFacts | null> {
  const [file, ...prefix] = options.command ?? ['gh'];

  const args = [
    'pr',
    'view',
    String(number),
    '--repo',
    repository,
    '--json',
    'headRefName,createdAt',
  ];

  const result = await runCapped(
    file,
    [...prefix, ...args, '--jq', '[.headRefName, .createdAt] | @tsv'],
    {
      signal: AbortSignal.timeout(options.timeoutMs ?? LOOKUP_TIMEOUT_MS),
      maxOutputBytes: MAX_LOOKUP_OUTPUT_BYTES,
    },
  );

  const [head = '', created = ''] = result.stdout.trim().split('\t');
  const createdAt = Date.parse(created);

  return result.exitCode === 0 && head !== '' && !Number.isNaN(createdAt)
    ? { head, createdAt }
    : null;
}
