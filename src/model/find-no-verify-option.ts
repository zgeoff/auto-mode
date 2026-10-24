import { hasExpansion } from '../shell/has-expansion.ts';
import { hasSplitExpansion } from '../shell/has-split-expansion.ts';
import { HIDDEN_GIT_WORDS } from './hidden-git-words.ts';

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

const PUSH_VALUED_LONG: ReadonlySet<string> = new Set([
  'exec',
  'push-option',
  'receive-pack',
  'repo',
]);

// git keeps the last of `--no-verify` and `--verify`, so a later `--verify`
// runs the hooks again, unless an expanded word before it can take it as its
// value.
export function findNoVerifyOption(
  args: readonly string[],
  raws: readonly string[],
  subcommand: 'commit' | 'push',
): string | null {
  let found: string | null = null;
  let isHidden = false;
  let index = 0;

  while (index < args.length && args[index] !== '--') {
    const arg = args[index] ?? '';
    const raw = raws[index] ?? '';
    let takesNextWord = false;

    // The shell splits an unquoted expansion into words that git reads as
    // options, and an expansion at the start of an option word can be one.
    if (hasSplitExpansion(raw) || (isExpandedOption(arg, subcommand) && hasExpansion(raw, 'any'))) {
      isHidden = true;
    } else if (arg.startsWith('--')) {
      const [option = '', ...value] = arg.slice(2).split('=');

      // git accepts an unambiguous prefix of a long option, such as `--no-veri`.
      if (option.startsWith('no-ve') && 'no-verify'.startsWith(option)) {
        found = '--no-verify';
      } else if (option.startsWith('veri') && 'verify'.startsWith(option)) {
        found = null;
      }

      takesNextWord =
        value.length === 0 &&
        (subcommand === 'commit'
          ? COMMIT_VALUED_LONG.has(findCommitOption(option) ?? '')
          : PUSH_VALUED_LONG.has(option));
    } else if (subcommand === 'push') {
      takesNextWord = arg === '-o';
    } else if (arg.startsWith('-') && arg !== '-') {
      // On `git push`, `-n` is `--dry-run` and keeps the hooks.
      const cluster = parseCommitCluster(arg);

      if (cluster.hasNoVerify) {
        found = '-n';
      }

      takesNextWord = cluster.takesNextWord;
    }

    // A value word stays one word unless the shell splits it.
    if (takesNextWord) {
      isHidden ||= hasSplitExpansion(raws[index + 1] ?? '');
      index += 1;
    }

    index += 1;
  }

  return found ?? (isHidden ? HIDDEN_GIT_WORDS.option : null);
}

// An expansion can name an option when it comes before a short option that
// takes the rest of its word as a value: `-$X` can be `-n`, `-m$X` cannot.
function isExpandedOption(arg: string, subcommand: 'commit' | 'push'): boolean {
  const short = subcommand === 'commit' ? /^-[^-CFcmtSu$`]*[$`]/u : /^-[^-o$`]*[$`]/u;

  return /^(?:--[^=]*)?[$`]/u.test(arg) || short.test(arg);
}

// git reads a long option from any prefix that names one option alone, and an
// exact name wins over a longer one, so `--mess` is `--message` and `--all` is
// not `--allow-empty`.
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

// A short commit option that takes a value takes the rest of its cluster, or
// else the next word; `-u` and `-S` take only the rest.
const COMMIT_VALUED_SHORT = 'CFcmt';
const COMMIT_ATTACHED_SHORT = 'Su';

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
