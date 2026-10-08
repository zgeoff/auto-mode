import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { loadRepositoryContext } from '../model/load-repository-context.ts';
import { buildCWDScope } from './build-cwd-scope.ts';
import type { OwnedScope, ScopeRemote } from './collect-scope-findings.ts';

// The cwd scope: the worktree holding the action's cwd, its branch unless it is
// the default branch, and the checkout's remotes. Outside a checkout the scope is
// the cwd itself.
export async function loadTaskScope(cwd: string): Promise<OwnedScope> {
  const [checkout, context] = await Promise.all([
    findCheckout(resolve(cwd)),
    loadRepositoryContext(cwd),
  ]);

  return buildCWDScope({
    home: homedir(),
    worktree: checkout?.worktree ?? resolve(cwd),
    branch: context?.branch ?? null,
    defaultBranch: context?.defaultBranch ?? null,
    remotes: checkout === null ? [] : await readRemotes(checkout.commonDir),
  });
}

interface Checkout {
  readonly worktree: string;
  readonly commonDir: string;
}

const GIT_OVERRIDES = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR'];

async function findCheckout(start: string): Promise<Checkout | null> {
  if (GIT_OVERRIDES.some((name) => process.env[name] !== undefined)) {
    return null;
  }

  for (let directory = start; ; directory = dirname(directory)) {
    const gitPath = join(directory, '.git');

    const info = await stat(gitPath).catch(() => null);

    if (info !== null) {
      const gitDir = info.isDirectory() ? gitPath : await findLinkedGitDir(directory, gitPath);

      return gitDir === null
        ? null
        : { worktree: directory, commonDir: await findCommonDir(gitDir) };
    }

    if (dirname(directory) === directory) {
      return null;
    }
  }
}

async function findLinkedGitDir(directory: string, gitPath: string): Promise<string | null> {
  const link = await readFile(gitPath, 'utf8').catch(() => '');

  const path = /^gitdir: (?<path>.+)$/mu.exec(link)?.groups?.['path'];

  return path === undefined ? null : resolve(directory, path.trim());
}

async function findCommonDir(gitDir: string): Promise<string> {
  const common = await readFile(join(gitDir, 'commondir'), 'utf8').catch(() => null);

  return common === null ? gitDir : resolve(gitDir, common.trim());
}

async function readRemotes(commonDir: string): Promise<ScopeRemote[]> {
  const config = await readFile(join(commonDir, 'config'), 'utf8').catch(() => '');

  const remotes: ScopeRemote[] = [];
  let section: string | null = null;

  for (const line of config.split('\n')) {
    const header = /^\s*\[remote "(?<name>[^"]+)"\]/u.exec(line)?.groups?.['name'];

    if (header !== undefined) {
      section = header;
    } else if (/^\s*\[/u.test(line)) {
      section = null;
    } else if (section !== null) {
      const url = /^\s*(?:push)?url\s*=\s*(?<url>\S+)/u.exec(line)?.groups?.['url'];

      if (url !== undefined) {
        remotes.push({ name: section, url });
      }
    }
  }

  return remotes;
}
