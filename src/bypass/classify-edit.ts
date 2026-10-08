import { Buffer } from 'node:buffer';
import { basename, relative, sep } from 'node:path';
import { findSecret } from '../secrets/find-secret.ts';
import { getEditFields } from './get-edit-fields.ts';

export interface EditAction {
  readonly toolName: string;
  readonly toolInput: Readonly<Record<string, unknown>>;
  readonly requested: string;
  readonly target: string;
}

export interface EditScope {
  readonly worktrees: readonly string[];
  readonly protectedDirs: readonly string[];
}

export type EditClassification =
  | { readonly kind: 'bypass'; readonly target: string }
  | { readonly kind: 'jev'; readonly reason: string };

// The scan reads about 18 ms per 100 KB under node, so anything larger than
// this goes to Jev unscanned rather than scanned in part.
export const MAX_SCANNED_BYTES = 256 * 1024;

export function classifyEdit(
  action: Readonly<EditAction>,
  scope: Readonly<EditScope>,
): EditClassification {
  const fields = getEditFields(action.toolName);

  if (fields === null) {
    return { kind: 'jev', reason: 'not a file-tool edit' };
  }

  const content = action.toolInput[fields.content] ?? '';

  if (typeof content !== 'string') {
    return { kind: 'jev', reason: 'edit content is not text' };
  }

  const worktree = findWorktree(action.target, scope.worktrees);

  if (worktree === null) {
    return { kind: 'jev', reason: 'target outside every in-scope worktree' };
  }

  const path = relative(worktree, action.target).split(sep).join('/');

  if (path.startsWith('.worktrees/')) {
    return { kind: 'jev', reason: 'target in a nested worktree outside the scope' };
  }

  // A link can give an excluded name an ordinary target, or the reverse, so
  // both the path as written and the path it resolves to must pass.
  const paths = [action.target, action.requested];

  const exclusion = paths.some((each) => scope.protectedDirs.some((dir) => isWithin(each, dir)))
    ? 'auto-mode configuration or state'
    : (findExclusion(path) ?? findExclusion(action.requested));

  if (exclusion !== null) {
    return { kind: 'jev', reason: `target is ${exclusion}` };
  }

  if (Buffer.byteLength(content, 'utf8') > MAX_SCANNED_BYTES) {
    return { kind: 'jev', reason: 'content larger than the secret scan reads' };
  }

  const secret = findSecret({ text: content, path });

  return secret === null
    ? { kind: 'bypass', target: action.target }
    : { kind: 'jev', reason: `secret scan matched ${secret.rule}` };
}

// Worktrees nest (`.worktrees/<name>` sits inside the main checkout), so the
// deepest one that holds the target is the one it belongs to.
function findWorktree(target: string, worktrees: readonly string[]): string | null {
  const holding = worktrees.filter((worktree) => isWithin(target, worktree));

  return holding.toSorted((a, b) => b.length - a.length)[0] ?? null;
}

function isWithin(path: string, dir: string): boolean {
  const offset = relative(dir, path);

  return offset !== '' && !offset.startsWith('..') && !offset.startsWith(sep);
}

const EXCLUDED_DIRS: readonly (readonly [string, string])[] = [
  ['.git', 'git metadata'],
  ['.claude', 'agent configuration'],
  ['.codex', 'agent configuration'],
  ['.muse', 'agent configuration'],
  ['.husky', 'a hook file'],
  ['.githooks', 'a hook file'],
  ['.github/workflows', 'a CI workflow'],
  ['.circleci', 'a CI workflow'],
  ['.ssh', 'a credential file'],
  ['.aws', 'a credential file'],
  ['.kube', 'a credential file'],
  ['.docker', 'a credential file'],
  ['.gnupg', 'a credential file'],
];

const EXCLUDED_NAMES: readonly (readonly [RegExp, string])[] = [
  [/^(?:agents|claude)(?:\.[\w-]+)?\.md$/i, 'agent configuration'],
  [/^settings(?:\.[\w-]+)?\.json$/i, 'a settings file'],
  [/^(?:hooks\.json|\.?lefthook(?:-local)?\.ya?ml|\.pre-commit-config\.ya?ml)$/i, 'a hook file'],
  [/^\.gitlab-ci\.ya?ml$/i, 'a CI workflow'],
  [/^\.env(?:\..*)?$|^\.envrc$/i, 'an env file'],
  [/^(?:\.netrc|\.npmrc|\.pypirc|\.git-credentials|\.dockercfg|kubeconfig)$/i, 'a credential file'],
  [/^credentials(?:\.\w+)?$|^secrets?\.(?:json|ya?ml|toml|env)$/i, 'a credential file'],
  [
    /^id_(?:rsa|dsa|ecdsa|ed25519)|\.(?:pem|key|p12|pfx|jks|keystore|tfvars)$/i,
    'a credential file',
  ],
];

function findExclusion(path: string): string | null {
  const lower = path.toLowerCase();

  const dir = EXCLUDED_DIRS.find(
    ([prefix]) =>
      lower === prefix ||
      lower.endsWith(`/${prefix}`) ||
      lower.startsWith(`${prefix}/`) ||
      lower.includes(`/${prefix}/`),
  );

  if (dir !== undefined) {
    return dir[1];
  }

  const name = basename(path);

  return EXCLUDED_NAMES.find(([pattern]) => pattern.test(name))?.[1] ?? null;
}
