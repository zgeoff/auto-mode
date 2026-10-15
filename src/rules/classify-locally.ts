import { isAbsolute, normalize, relative } from 'node:path';
import invariant from 'tiny-invariant';
import type { ActionRequest } from '../request/types.ts';
import { splitCommandWords } from '../shell/split-command-words.ts';
import { splitGitCommand } from '../shell/split-git-command.ts';
import { splitShellCommand } from '../shell/split-shell-command.ts';
import { splitShellTokens } from '../shell/split-shell-tokens.ts';
import {
  READ_ONLY_COMMANDS,
  READ_ONLY_GIT_SUBCOMMANDS,
  READ_ONLY_TOOLS,
  REGENERABLE_DIRS,
  SHELL_TOOLS,
  UNSAFE_GIT_GLOBAL_OPTIONS,
  UNSAFE_GIT_OPTIONS,
  UNSAFE_OPTIONS,
} from './local-allowlists.ts';
import type { UnsafeOptions } from './local-allowlists.ts';

export type LocalVerdict =
  | { readonly kind: 'allow'; readonly exception: string }
  | { readonly kind: 'escalate' };

const ESCALATE: LocalVerdict = { kind: 'escalate' };

export function classifyLocally(payload: ActionRequest): LocalVerdict {
  if (READ_ONLY_TOOLS.has(payload.toolName)) {
    return { kind: 'allow', exception: 'Read-only actions' };
  }

  if (!SHELL_TOOLS.has(payload.toolName)) {
    return ESCALATE;
  }

  const command = payload.toolInput['command'];

  if (typeof command !== 'string' || command === '') {
    return ESCALATE;
  }

  const chain = splitShellCommand(command);

  if (chain.hasUnparsedConstruct || chain.segments.length === 0) {
    return ESCALATE;
  }

  let exception = 'Read-only actions';

  for (const segment of chain.segments) {
    const verdict = classifySegment(segment.text, payload.cwd);

    if (verdict === null) {
      return ESCALATE;
    }

    // A chain is only as allowable as its least-obvious part, and the reason
    // reported should name the part that needed an exception.
    if (verdict !== 'Read-only actions') {
      exception = verdict;
    }
  }

  return { kind: 'allow', exception };
}

function classifySegment(text: string, cwd: string): string | null {
  const words = splitWords(text);

  // splitCommandWords drops a leading assignment and a wrapper such as env or
  // sudo. Either one changes what runs, so a segment it shortens passes on.
  if (words.length === 0 || splitCommandWords(text).length !== words.length) {
    return null;
  }

  const [head, ...rest] = words;

  invariant(head !== undefined, 'the segment holds at least one word');

  const name = head.raw.slice(head.raw.lastIndexOf('/') + 1);
  const args = rest.map((word) => word.value);

  if (READ_ONLY_COMMANDS.has(name)) {
    const unsafe = UNSAFE_OPTIONS.get(name);

    return unsafe === undefined || !hasUnsafeOption(args, unsafe) ? 'Read-only actions' : null;
  }

  if (name === 'git') {
    return classifyGit(args, cwd);
  }

  if (name === 'rm') {
    return classifyRemove(rest, cwd);
  }

  return null;
}

// Reads the arguments as getopt does: options end at `--`, a single dash
// starts a cluster of short options, and a lone `-` is an operand.
function hasUnsafeOption(args: readonly string[], unsafe: Readonly<UnsafeOptions>): boolean {
  const end = args.indexOf('--');
  const options = end === -1 ? args : args.slice(0, end);
  const operands = countOperands(options, unsafe) + (end === -1 ? 0 : args.length - end - 1);

  return (
    args.some((arg) => unsafe.words?.includes(arg) === true) ||
    options.some((arg) => isUnsafeOption(arg, unsafe)) ||
    (unsafe.operands !== undefined && operands > unsafe.operands)
  );
}

function isUnsafeOption(arg: string, unsafe: Readonly<UnsafeOptions>): boolean {
  if (arg.startsWith('--')) {
    const name = arg.slice(2).split('=', 1)[0] ?? '';

    return name !== '' && unsafe.long?.some((long) => long.startsWith(name)) === true;
  }

  return isOptionWord(arg) && unsafe.short?.some((letter) => arg.includes(letter, 1)) === true;
}

function countOperands(options: readonly string[], unsafe: Readonly<UnsafeOptions>): number {
  let count = 0;
  let index = 0;

  while (index < options.length) {
    const arg = options[index] ?? '';

    if (!isOptionWord(arg)) {
      count += 1;
    } else if (needsValueWord(arg, unsafe)) {
      index += 1;
    }

    index += 1;
  }

  return count;
}

// A short option that takes a value reads the rest of its cluster, so the
// next word is its value only when the value letter ends the cluster.
function needsValueWord(arg: string, unsafe: Readonly<UnsafeOptions>): boolean {
  const valued = unsafe.valued;

  if (valued === undefined) {
    return false;
  }

  if (arg.startsWith('--')) {
    const name = arg.slice(2);

    return !name.includes('=') && valued.long.some((long) => long.startsWith(name));
  }

  for (let index = 1; index < arg.length; index += 1) {
    if (valued.short.includes(arg.charAt(index))) {
      return index === arg.length - 1;
    }
  }

  return false;
}

function isOptionWord(arg: string): boolean {
  return arg.startsWith('-') && arg !== '-';
}

function classifyGit(args: readonly string[], cwd: string): string | null {
  const git = splitGitCommand(args, cwd, '');
  const globals = args.slice(0, args.length - git.args.length);
  const [sub, ...subArgs] = git.args;

  if (sub === undefined || !READ_ONLY_GIT_SUBCOMMANDS.has(sub)) {
    return null;
  }

  return hasUnsafeOption(globals, UNSAFE_GIT_GLOBAL_OPTIONS) ||
    hasUnsafeOption(subArgs, UNSAFE_GIT_OPTIONS)
    ? null
    : 'Read-only actions';
}

function classifyRemove(args: readonly ShellWord[], cwd: string): string | null {
  const paths = args.filter((arg) => !arg.raw.startsWith('-'));

  if (paths.length === 0) {
    return null;
  }

  for (const path of paths) {
    if (!isPlainOperand(path)) {
      return null;
    }

    const stripped = path.value;

    if (stripped.includes('*') || stripped.includes('~') || stripped.includes('$')) {
      return null;
    }

    const resolved = isAbsolute(stripped) ? normalize(stripped) : normalize(`${cwd}/${stripped}`);
    const within = relative(cwd, resolved);

    if (within === '' || within.startsWith('..') || isAbsolute(within)) {
      return null;
    }

    const segments = within.split(/[\\/]/).filter((s) => s !== '');
    const last = segments.at(-1);

    if (last === undefined || !REGENERABLE_DIRS.has(last)) {
      return null;
    }
  }

  return 'Regenerable output';
}

interface ShellWord {
  readonly raw: string;
  readonly value: string;
}

// The words as written and with their quotes removed. A quoted program name
// matches no allowlist entry, because the raw word is what is matched.
function splitWords(text: string): readonly ShellWord[] {
  return splitShellTokens(text).tokens.flatMap((token) =>
    token.kind === 'word' ? [{ raw: token.raw, value: token.value }] : [],
  );
}

// An operand quoted whole or not at all, with no whitespace, is the one shape
// the path check reads; a partly quoted one such as `"/a b"/node_modules`
// names a path the check would misplace.
function isPlainOperand(word: Readonly<ShellWord>): boolean {
  const isWhole = [word.value, `'${word.value}'`, `"${word.value}"`].includes(word.raw);

  return isWhole && !/\s/u.test(word.value);
}
