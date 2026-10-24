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
  SAFE_GIT_GLOBAL_FLAGS,
  SHELL_TOOLS,
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

    if (verdict !== 'Read-only actions') {
      exception = verdict;
    }
  }

  return { kind: 'allow', exception };
}

function classifySegment(text: string, cwd: string): string | null {
  // Bash opens a socket for `< /dev/tcp/host/port`.
  if (splitShellTokens(text).tokens.some((token) => token.kind === 'redirect')) {
    return null;
  }

  const words = splitWords(text);

  // A leading assignment or a wrapper such as env or sudo changes what runs.
  if (words.length === 0 || splitCommandWords(text).length !== words.length) {
    return null;
  }

  // The rules read each word literally, so a word the shell expands, such as
  // `{/repo,clean}` or `--out\put`, would be read as other words than it runs.
  if (words.some((word) => hasShellExpansion(word.raw))) {
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

interface ShellWord {
  readonly raw: string;
  readonly value: string;
}

function splitWords(text: string): readonly ShellWord[] {
  return splitShellTokens(text).tokens.flatMap((token) =>
    token.kind === 'word' ? [{ raw: token.raw, value: token.value }] : [],
  );
}

function hasShellExpansion(raw: string): boolean {
  let quote: "'" | '"' | null = null;
  let previous = '';

  for (const char of raw) {
    if (quote === "'") {
      quote = char === "'" ? null : quote;
    } else if (char === '\\' || char === '$' || char === '`') {
      return true;
    } else if (char === quote) {
      quote = null;
    } else if (quote === null && (char === "'" || char === '"')) {
      quote = char;
    } else if (quote === null && isExpansionCharacter(char, previous)) {
      return true;
    }

    previous = char;
  }

  return false;
}

function isExpansionCharacter(char: string, previous: string): boolean {
  // A tilde expands only at the start of a word or after `=` or `:`, so the
  // literal `HEAD~1` stays readable.
  if (char === '~') {
    return previous === '' || previous === '=' || previous === ':';
  }

  return '{}*?[]()!'.includes(char) || /\s/u.test(char);
}

function hasUnsafeOption(args: readonly string[], unsafe: Readonly<UnsafeOptions>): boolean {
  if (args.some((arg) => unsafe.words?.includes(arg) === true)) {
    return true;
  }

  let operands = 0;
  let index = 0;

  while (index < args.length) {
    const arg = args[index] ?? '';

    if (arg === '--') {
      operands += args.length - index - 1;
      break;
    }

    if (isOptionWord(arg)) {
      const option = parseOption(arg, unsafe);

      if (option.isUnsafe) {
        return true;
      }

      // getopt would take a value word that starts with a dash as the value.
      if (option.takesNextWord && !isOptionWord(args[index + 1] ?? '-')) {
        index += 1;
      }
    } else {
      operands += 1;
    }

    index += 1;
  }

  return unsafe.operands !== undefined && operands > unsafe.operands;
}

function isOptionWord(arg: string): boolean {
  return arg.startsWith('-') && arg !== '-';
}

interface ParsedOption {
  readonly isUnsafe: boolean;
  readonly takesNextWord: boolean;
}

function parseOption(arg: string, unsafe: Readonly<UnsafeOptions>): ParsedOption {
  const valued = unsafe.valued;

  if (arg.startsWith('--')) {
    const [name = '', ...value] = arg.slice(2).split('=');

    return {
      isUnsafe: name !== '' && unsafe.long?.some((long) => long.startsWith(name)) === true,
      takesNextWord: value.length === 0 && valued?.long.includes(name) === true,
    };
  }

  for (let index = 1; index < arg.length; index += 1) {
    const letter = arg.charAt(index);

    if (unsafe.short?.includes(letter) === true) {
      return { isUnsafe: true, takesNextWord: false };
    }

    if (valued?.attached?.includes(letter) === true) {
      break;
    }

    if (valued?.short.includes(letter) === true) {
      return { isUnsafe: false, takesNextWord: index === arg.length - 1 };
    }
  }

  return { isUnsafe: false, takesNextWord: false };
}

function classifyGit(args: readonly string[], cwd: string): string | null {
  const git = splitGitCommand(args, cwd, '');
  const globals = args.slice(0, args.length - git.args.length);
  const [sub, ...subArgs] = git.args;

  if (sub === undefined || !READ_ONLY_GIT_SUBCOMMANDS.has(sub)) {
    return null;
  }

  return hasOnlySafeGitGlobals(globals) && !hasUnsafeOption(subArgs, UNSAFE_GIT_OPTIONS)
    ? 'Read-only actions'
    : null;
}

// A git global option such as `--work-tree` takes the next word as its value, so
// in `--work-tree status` the word `status` is not the subcommand git runs.
function hasOnlySafeGitGlobals(globals: readonly string[]): boolean {
  let index = 0;

  while (index < globals.length) {
    const option = globals[index] ?? '';

    if (option === '-C') {
      const directory = globals[index + 1];

      if (directory === undefined || directory.startsWith('-')) {
        return false;
      }

      index += 2;
    } else if (SAFE_GIT_GLOBAL_FLAGS.has(option)) {
      index += 1;
    } else {
      return false;
    }
  }

  return true;
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

    const segments = within.split(/[\\/]/u).filter((segment) => segment !== '');
    const last = segments.at(-1);

    if (last === undefined || !REGENERABLE_DIRS.has(last)) {
      return null;
    }
  }

  return 'Regenerable output';
}

function isPlainOperand(word: Readonly<ShellWord>): boolean {
  const isWhole = [word.value, `'${word.value}'`, `"${word.value}"`].includes(word.raw);

  return isWhole && !/\s/u.test(word.value);
}
