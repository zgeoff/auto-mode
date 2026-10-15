import { splitCommandWords } from '../shell/split-command-words.ts';
import { splitGitCommand } from '../shell/split-git-command.ts';
import { splitShellCommand } from '../shell/split-shell-command.ts';
import { splitShellTokens } from '../shell/split-shell-tokens.ts';

// The words of a shell command that turn off the repository's git hooks for a
// commit or a push, as the command writes them.
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

  const assignments = words.slice(0, words.length - program.length);
  const option = findNoVerifyOption(subArgs, subcommand);

  return [...collectHookSwitches(assignments), ...(option === null ? [] : [option])];
}

// lefthook skips its hooks for `0` or `false`, husky for `0` alone.
const HOOK_SWITCH_VALUES: ReadonlyMap<string, readonly string[]> = new Map([
  ['LEFTHOOK', ['0', 'false']],
  ['HUSKY', ['0']],
]);

// The shell keeps the last assignment to a name, so an earlier one is dropped.
function collectHookSwitches(assignments: readonly string[]): readonly string[] {
  return [...HOOK_SWITCH_VALUES].flatMap(([name, values]) => {
    const last = assignments.findLast((word) => word.startsWith(`${name}=`));

    return last !== undefined && values.includes(last.slice(name.length + 1)) ? [last] : [];
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
        found = arg;
      } else if (option.startsWith('veri') && 'verify'.startsWith(option)) {
        found = null;
      }

      if (subcommand === 'commit' && value.length === 0 && COMMIT_VALUED_LONG.has(option)) {
        index += 1;
      }
    } else if (subcommand === 'commit' && arg.startsWith('-') && arg !== '-') {
      // On `git push`, `-n` is `--dry-run` and keeps the hooks.
      const cluster = parseCommitCluster(arg);

      if (cluster.hasNoVerify) {
        found = arg;
      }

      if (cluster.takesNextWord) {
        index += 1;
      }
    }

    index += 1;
  }

  return found;
}

interface CommitCluster {
  readonly hasNoVerify: boolean;
  readonly takesNextWord: boolean;
}

function parseCommitCluster(arg: string): CommitCluster {
  for (let index = 1; index < arg.length; index += 1) {
    const letter = arg.charAt(index);

    if (letter === 'n') {
      return { hasNoVerify: true, takesNextWord: false };
    }

    if (COMMIT_ATTACHED_SHORT.includes(letter)) {
      break;
    }

    if (COMMIT_VALUED_SHORT.includes(letter)) {
      return { hasNoVerify: false, takesNextWord: index === arg.length - 1 };
    }
  }

  return { hasNoVerify: false, takesNextWord: false };
}
