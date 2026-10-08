import { Buffer } from 'node:buffer';
import { basename, relative, sep } from 'node:path';
import { findSecret } from '../secrets/find-secret.ts';
import { getEditFields } from './get-edit-fields.ts';

export interface EditAction {
  readonly toolName: string;
  readonly toolInput: Readonly<Record<string, unknown>>;
  readonly requested: string;
  readonly target: string;
  readonly checkout: string | null;
  readonly current: string | null;
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
const MAX_SCANNED_BYTES = 256 * 1024;

export function classifyEdit(
  action: Readonly<EditAction>,
  scope: Readonly<EditScope>,
): EditClassification {
  const fields = getEditFields(action.toolName);

  if (fields === null) {
    return { kind: 'jev', reason: 'not a file-tool edit' };
  }

  const worktree = findWorktree(action.target, scope.worktrees);

  if (worktree === null) {
    return { kind: 'jev', reason: 'target outside every in-scope worktree' };
  }

  const path = relative(worktree, action.target).split(sep).join('/');

  if (path.startsWith('.worktrees/')) {
    return { kind: 'jev', reason: 'target in a nested worktree outside the scope' };
  }

  if (action.checkout !== null && action.checkout !== worktree) {
    return { kind: 'jev', reason: 'target in a checkout outside the scope' };
  }

  // A link can give an excluded name an ordinary target, or the reverse, so
  // both the path as written and the path it resolves to must pass.
  const paths = [action.target, action.requested];

  const exclusion = paths.some((each) => scope.protectedDirs.some((dir) => isWithin(each, dir)))
    ? 'auto-mode configuration or state'
    : (findExclusion(path) ?? findExclusion(toWorktreePath(action.requested, scope.worktrees)));

  if (exclusion !== null) {
    return { kind: 'jev', reason: `target is ${exclusion}` };
  }

  const text = buildScanText(action, fields.content);

  if (typeof text !== 'string') {
    return { kind: 'jev', reason: text.reason };
  }

  if (Buffer.byteLength(text, 'utf8') > MAX_SCANNED_BYTES) {
    return { kind: 'jev', reason: 'content larger than the secret scan reads' };
  }

  const secret = findSecret({ text, path });

  return secret === null
    ? { kind: 'bypass', target: action.target }
    : { kind: 'jev', reason: `secret scan matched ${secret.rule}` };
}

// A rule can need the text around a value, such as the assignment a key sits
// in, and the curl rules span up to 11 newlines; so an Edit is scanned as the
// lines around each replacement in the file it produces.
const CONTEXT_LINES = 12;

function buildScanText(
  action: Readonly<EditAction>,
  field: string,
): string | { readonly reason: string } {
  const content = action.toolInput[field] ?? '';

  if (typeof content !== 'string') {
    return { reason: 'edit content is not text' };
  }

  if (action.toolName !== 'Edit') {
    return content;
  }

  const old = action.toolInput['old_string'];

  if (typeof old !== 'string' || old === '' || action.current === null) {
    return { reason: 'the edit cannot be read in the context of its file' };
  }

  const parts = action.current.split(old);

  if (parts.length === 1) {
    return { reason: 'the edit text is not in the file' };
  }

  const replaced = action.toolInput['replace_all'] === true ? parts.length - 1 : 1;
  const spans: { start: number; end: number }[] = [];
  let produced = parts[0] ?? '';

  for (let index = 1; index < parts.length; index += 1) {
    const isReplaced = index <= replaced;

    if (isReplaced) {
      spans.push({ start: produced.length, end: produced.length + content.length });
    }

    produced += `${isReplaced ? content : old}${parts[index] ?? ''}`;
  }

  return collectContext(produced, spans);
}

function collectContext(
  text: string,
  spans: readonly Readonly<{ start: number; end: number }>[],
): string {
  const lines = text.split('\n');
  const starts: number[] = [];
  let offset = 0;

  for (const line of lines) {
    starts.push(offset);

    offset += line.length + 1;
  }

  const keep = new Set<number>();

  for (const span of spans) {
    const first = starts.findLastIndex((start) => start <= span.start);
    const last = starts.findLastIndex((start) => start <= span.end);

    for (let line = first - CONTEXT_LINES; line <= last + CONTEXT_LINES; line += 1) {
      keep.add(line);
    }
  }

  return lines.filter((_, index) => keep.has(index)).join('\n');
}

// A path outside every worktree keeps its whole spelling, so that a link from
// an excluded directory such as `~/.claude` stays excluded.
function toWorktreePath(path: string, worktrees: readonly string[]): string {
  const worktree = findWorktree(path, worktrees);

  return worktree === null ? path : relative(worktree, path).split(sep).join('/');
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
