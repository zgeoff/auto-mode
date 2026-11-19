import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';

export interface ResultsClone {
  readonly directory: string;
  readonly root: string;
}

export async function requireResultsClone(
  directory: string,
  publicRoot: string,
): Promise<ResultsClone> {
  // A symlink into the public repository would otherwise pass for a results clone.
  const real = await realpath(directory).catch(() => {
    throw new Error(`The results directory does not exist: ${directory}`);
  });

  const publicReal = await realpath(publicRoot);

  if (isInside(publicReal, real)) {
    throw new Error(`Refusing to write results inside the public repository: ${real}`);
  }

  const root = readGitRoot(real);

  if (root === null) {
    throw new Error(`The results directory is not in a git clone: ${real}`);
  }

  if (!probeResultsClone(root)) {
    throw new Error(`The results directory is not a clone of zgeoff/auto-mode-evals: ${root}`);
  }

  return { directory: real, root };
}

function isInside(root: string, directory: string): boolean {
  const path = relative(root, directory);

  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function readGitRoot(directory: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: directory,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

const RESULTS_REMOTE =
  /^(?:https:\/\/(?:[^@/]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)zgeoff\/auto-mode-evals(?:\.git)?$/u;

const RESULTS_README_TITLE = '# auto-mode-evals';

function probeResultsClone(root: string): boolean {
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
