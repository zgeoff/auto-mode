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

// lefthook skips its hooks for `0` or `false`, husky for `0`.
const HOOK_SWITCH = /^(?:LEFTHOOK|HUSKY)=(?:0|false)$/u;

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

  return [
    ...assignments.filter((word) => HOOK_SWITCH.test(word)),
    ...collectNoVerifyOptions(subArgs, subcommand),
  ];
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

function collectNoVerifyOptions(
  args: readonly string[],
  subcommand: 'commit' | 'push',
): readonly string[] {
  const found: string[] = [];
  let index = 0;

  while (index < args.length && args[index] !== '--') {
    const arg = args[index] ?? '';

    if (arg.startsWith('--')) {
      const [option = '', ...value] = arg.slice(2).split('=');

      // git accepts an unambiguous prefix of a long option, such as `--no-veri`.
      if (option.startsWith('no-ve') && 'no-verify'.startsWith(option)) {
        found.push(arg);
      }

      if (subcommand === 'commit' && value.length === 0 && COMMIT_VALUED_LONG.has(option)) {
        index += 1;
      }
    } else if (subcommand === 'commit' && arg.startsWith('-') && arg !== '-') {
      // On `git push`, `-n` is `--dry-run` and keeps the hooks.
      const cluster = parseCommitCluster(arg);

      if (cluster.hasNoVerify) {
        found.push(arg);
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
