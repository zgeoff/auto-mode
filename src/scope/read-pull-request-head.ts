import { spawn } from 'node:child_process';

const LOOKUP_TIMEOUT_MS = 5000;

// `repository` is `host/owner/name`, which `gh --repo` accepts as written.
export function readPullRequestHead(repository: string, number: number): Promise<string | null> {
  const args = ['pr', 'view', String(number), '--repo', repository, '--json', 'headRefName'];

  return new Promise((resolve) => {
    const child = spawn('gh', [...args, '--jq', '.headRefName'], {
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
      const head = output.trim();
      const isFound = code === 0 && head !== '';
      const value = isFound ? head : null;

      resolve(value);
    });
  });
}
