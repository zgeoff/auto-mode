import { spawn } from 'node:child_process';

export interface PullRequestFacts {
  readonly head: string;
  readonly createdAt: number;
}

const LOOKUP_TIMEOUT_MS = 5000;

// `repository` is `host/owner/name`, which `gh --repo` accepts as written.
export function readPullRequest(
  repository: string,
  number: number,
): Promise<PullRequestFacts | null> {
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
    const child = spawn('gh', [...args, '--jq', '[.headRefName, .createdAt] | @tsv'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: LOOKUP_TIMEOUT_MS,
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
