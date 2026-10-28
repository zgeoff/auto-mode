import type { RunProgram } from './run-program.ts';
import { runProgram } from './run-program.ts';

export interface ReleaseMergeOptions {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;

  // owner/name, as GITHUB_REPOSITORY holds it.
  readonly repository: string;

  readonly attempts: number;
  readonly wait: () => Promise<void>;
  readonly runProgram: RunProgram;
}

export async function runReleaseMerge(options: Readonly<ReleaseMergeOptions>): Promise<string[]> {
  const list = options.runProgram(
    [
      'gh',
      'pr',
      'list',
      '--repo',
      options.repository,
      '--head',
      'release-please--branches--main',
      '--json',
      'number',
      '--jq',
      '.[].number',
    ],
    { cwd: options.cwd, env: options.env },
  );

  if (list.exitCode !== 0) {
    throw new Error(`gh pr list failed: ${list.stderr.trim()}`);
  }

  const problems: string[] = [];

  for (const number of list.stdout.split('\n').filter((line) => line !== '')) {
    const problem = await mergeReleasePullRequest(options, number);

    if (problem !== undefined) {
      problems.push(problem);
    }
  }

  return problems;
}

// GitHub computes mergeability after release-please pushes, and a MERGEABLE read can be stale, so
// a refused merge waits and reads the state again instead of failing.
async function mergeReleasePullRequest(
  options: Readonly<ReleaseMergeOptions>,
  number: string,
): Promise<string | undefined> {
  const run = { cwd: options.cwd, env: options.env };

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    const view = options.runProgram(
      [
        'gh',
        'pr',
        'view',
        number,
        '--repo',
        options.repository,
        '--json',
        'mergeable',
        '--jq',
        '.mergeable',
      ],
      run,
    );

    const state = view.stdout.trim();

    if (state === 'CONFLICTING') {
      return `release PR #${number} has conflicts`;
    }

    if (state === 'MERGEABLE') {
      const merge = options.runProgram(
        ['gh', 'pr', 'merge', number, '--repo', options.repository, '--squash'],
        run,
      );

      if (merge.exitCode === 0) {
        return undefined;
      }
    }

    if (attempt < options.attempts) {
      await options.wait();
    }
  }

  return `release PR #${number} never became mergeable`;
}

async function runCLI(): Promise<void> {
  const repository = process.env['GITHUB_REPOSITORY'];

  if (repository === undefined) {
    process.stderr.write('release merge: GITHUB_REPOSITORY is not set\n');

    process.exitCode = 2;

    return;
  }

  const problems = await runReleaseMerge({
    cwd: process.cwd(),
    env: process.env,
    repository,
    attempts: 12,
    wait: () => Bun.sleep(5000),
    runProgram,
  });

  for (const problem of problems) {
    process.stderr.write(`release merge: ${problem}\n`);
  }

  process.exitCode = problems.length === 0 ? 0 : 1;
}

if (import.meta.main) {
  await runCLI();
}
