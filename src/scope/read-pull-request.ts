import { spawn } from 'node:child_process';

export interface PullRequestFacts {
  readonly head: string;
  readonly createdAt: number;
}

interface ReadPullRequestOptions {
  readonly command?: readonly [string, ...string[]];
  readonly timeoutMs?: number;
}

const LOOKUP_TIMEOUT_MS = 5000;

// `repository` is `host/owner/name`, which `gh --repo` accepts as written.
export function readPullRequest(
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

  return new Promise((resolve) => {
    const child = spawn(file, [...prefix, ...args, '--jq', '[.headRefName, .createdAt] | @tsv'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: options.timeoutMs ?? LOOKUP_TIMEOUT_MS,
    });

    let output = '';

    child.stdout.setEncoding('utf8');

    child.stdout.on('data', (chunk: string) => {
      output += chunk;
    });

    child.on('error', () => {
      resolve(null);
    });

    child.on('close', (code) => {
      const [head = '', created = ''] = output.trim().split('\t');
      const createdAt = Date.parse(created);

      const facts =
        code === 0 && head !== '' && !Number.isNaN(createdAt) ? { head, createdAt } : null;

      resolve(facts);
    });
  });
}
