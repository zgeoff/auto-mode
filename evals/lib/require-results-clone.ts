import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { join, relative } from 'node:path';

const RESULTS_REMOTE = /(?:^|[/:])zgeoff\/auto-mode-evals(?:\.git)?$/;
const RESULTS_README_TITLE = '# auto-mode-evals';

export interface ResultsClone {
  readonly dir: string;
  readonly root: string;
}

// Paths are compared after resolving symlinks, so a link into the public
// repository cannot pass for a results clone. The clone is recognised by its
// origin remote, or by the README title and manifest a fork or mirror keeps.
export async function requireResultsClone(dir: string, publicRoot: string): Promise<ResultsClone> {
  const real = await realpath(dir).catch(() => {
    throw new Error(`The results directory does not exist: ${dir}`);
  });

  const publicReal = await realpath(publicRoot);

  if (isInside(publicReal, real)) {
    throw new Error(`Refusing to write results inside the public repository: ${real}`);
  }

  const root = readGitRoot(real);

  if (root === null) {
    throw new Error(`The results directory is not in a git clone: ${real}`);
  }

  if (!isResultsClone(root)) {
    throw new Error(`The results directory is not a clone of zgeoff/auto-mode-evals: ${root}`);
  }

  return { dir: real, root };
}

function isInside(root: string, dir: string): boolean {
  const path = relative(root, dir);

  return path === '' || (!path.startsWith('..') && !path.startsWith('/'));
}

function readGitRoot(dir: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function isResultsClone(root: string): boolean {
  if (RESULTS_REMOTE.test(readOrigin(root))) {
    return true;
  }

  const readme = join(root, 'README.md');

  return (
    existsSync(join(root, 'MANIFEST.sha256')) &&
    existsSync(readme) &&
    readFileSync(readme, 'utf8').split('\n', 1)[0] === RESULTS_README_TITLE
  );
}

function readOrigin(root: string): string {
  try {
    return execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}
