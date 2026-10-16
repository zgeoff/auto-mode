import { splitCommandWords } from '../shell/split-command-words.ts';
import { splitGitCommand } from '../shell/split-git-command.ts';
import { splitShellCommand } from '../shell/split-shell-command.ts';
import { splitShellTokens } from '../shell/split-shell-tokens.ts';

// The switches in a shell command that turn off the repository's git hooks for
// a commit or a push. Each is a fixed label, never the command's own text,
// because the labels reach the classifier's trusted instructions.
export function collectHookBypasses(command: string): readonly string[] {
  return splitShellCommand(command).segments.flatMap((segment) =>
    collectSegmentBypasses(segment.text),
  );
}

function collectSegmentBypasses(text: string): readonly string[] {
  const words = splitShellTokens(text).tokens.flatMap((token) =>
    token.kind === 'word' ? [token.value] : [],
  );

  const program = splitCommandWords(text);
  const [name = '', ...args] = program;

  if (name.slice(name.lastIndexOf('/') + 1) !== 'git') {
    return [];
  }

  const [subcommand, ...subArgs] = splitGitCommand(args, null, '').args;

  if (subcommand !== 'commit' && subcommand !== 'push') {
    return [];
  }

  const prefix = words.slice(0, words.length - program.length);
  const option = findNoVerifyOption(subArgs, subcommand);

  return [...collectHookSwitches(prefix), ...(option === null ? [] : [option])];
}

// lefthook skips its hooks for `0` or `false`, husky for `0` alone.
const HOOK_SWITCH_VALUES: ReadonlyMap<string, readonly string[]> = new Map([
  ['LEFTHOOK', ['0', 'false']],
  ['HUSKY', ['0']],
]);

// The words before the program set and unset variables in order: a later
// assignment replaces an earlier one, and `env -u NAME` removes it, so only
// the last state of each name reaches git.
function collectHookSwitches(prefix: readonly string[]): readonly string[] {
  const reaching = new Map<string, string>();

  for (let index = 0; index < prefix.length; index += 1) {
    const word = prefix[index] ?? '';
    const name = word.slice(0, word.indexOf('='));

    if (word === '-u') {
      reaching.delete(prefix[index + 1] ?? '');

      index += 1;
    } else if (/^\w+$/u.test(name)) {
      reaching.set(name, word);
    }
  }

  return [...HOOK_SWITCH_VALUES].flatMap(([name, values]) => {
    const word = reaching.get(name);

    return word !== undefined && values.includes(word.slice(name.length + 1)) ? [word] : [];
  });
}

// The commit options that take a value, so the value word is not read as an
// option. A short one takes the rest of its cluster, or else the next word;
// `-u` and `-S` take only the rest.
const COMMIT_VALUED_SHORT = 'CFcmt';
const COMMIT_ATTACHED_SHORT = 'Su';

const COMMIT_VALUED_LONG: ReadonlySet<string> = new Set([
  'author',
  'cleanup',
  'date',
  'file',
  'fixup',
  'message',
  'pathspec-from-file',
  'reedit-message',
  'reuse-message',
  'squash',
  'template',
  'trailer',
]);

// git keeps the last of `--no-verify` and `--verify`, so a later `--verify`
// runs the hooks again.
function findNoVerifyOption(args: readonly string[], subcommand: 'commit' | 'push'): string | null {
  let found: string | null = null;
  let index = 0;

  while (index < args.length && args[index] !== '--') {
    const arg = args[index] ?? '';

    if (arg.startsWith('--')) {
      const [option = '', ...value] = arg.slice(2).split('=');

      // git accepts an unambiguous prefix of a long option, such as `--no-veri`.
      if (option.startsWith('no-ve') && 'no-verify'.startsWith(option)) {
        found = '--no-verify';
      } else if (option.startsWith('veri') && 'verify'.startsWith(option)) {
        found = null;
      }

      if (
        subcommand === 'commit' &&
        value.length === 0 &&
        COMMIT_VALUED_LONG.has(findCommitOption(option) ?? '')
      ) {
        index += 1;
      }
    } else if (subcommand === 'commit' && arg.startsWith('-') && arg !== '-') {
      // On `git push`, `-n` is `--dry-run` and keeps the hooks.
      const cluster = parseCommitCluster(arg);

      if (cluster.hasNoVerify) {
        found = '-n';
      }

      if (cluster.takesNextWord) {
        index += 1;
      }
    }

    index += 1;
  }

  return found;
}

// The commit options that take no value. git reads a long option from any
// prefix that names one option alone, and an exact name wins over a longer
// one, so `--mess` is `--message` and `--all` is not `--allow-empty`.
const COMMIT_FLAG_LONG: ReadonlySet<string> = new Set([
  'ahead-behind',
  'all',
  'allow-empty',
  'allow-empty-message',
  'amend',
  'branch',
  'dry-run',
  'edit',
  'gpg-sign',
  'include',
  'interactive',
  'long',
  'no-post-rewrite',
  'no-verify',
  'null',
  'only',
  'patch',
  'pathspec-file-nul',
  'porcelain',
  'post-rewrite',
  'quiet',
  'reset-author',
  'short',
  'signoff',
  'status',
  'untracked-files',
  'verbose',
  'verify',
]);

// An ambiguous prefix makes git refuse the commit, so it names no option.
function findCommitOption(option: string): string | null {
  const names = [...COMMIT_VALUED_LONG, ...COMMIT_FLAG_LONG];

  if (names.includes(option)) {
    return option;
  }

  const matches = names.filter((name) => name.startsWith(option));

  return matches.length === 1 ? (matches[0] ?? null) : null;
}

interface CommitCluster {
  readonly hasNoVerify: boolean;
  readonly takesNextWord: boolean;
}

function parseCommitCluster(arg: string): CommitCluster {
  let hasNoVerify = false;

  for (let index = 1; index < arg.length; index += 1) {
    const letter = arg.charAt(index);

    if (letter === 'n') {
      hasNoVerify = true;
    } else if (COMMIT_ATTACHED_SHORT.includes(letter)) {
      break;
    } else if (COMMIT_VALUED_SHORT.includes(letter)) {
      return { hasNoVerify, takesNextWord: index === arg.length - 1 };
    }
  }

  return { hasNoVerify, takesNextWord: false };
}
