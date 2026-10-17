import { SCRATCH_PATHS } from '../config/scratch-paths.ts';
import type { OwnedScope } from '../scope/types.ts';
import { collectShellCommands } from '../shell/collect-shell-commands.ts';
import type { ShellCommand } from '../shell/collect-shell-commands.ts';
import { collectShellScripts } from '../shell/collect-shell-scripts.ts';
import { splitShellCommand } from '../shell/split-shell-command.ts';
import { splitShellTokens } from '../shell/split-shell-tokens.ts';
import { collectProgramFindings } from './collect-program-findings.ts';
import { collectTargetFindings } from './collect-target-findings.ts';
import { isOwnedPullRequest } from './is-owned-pull-request.ts';
import type { ScopeFinding } from './types.ts';

interface ScopeAction {
  readonly tool: string;
  readonly cwd: string;
  readonly input: Readonly<Record<string, unknown>>;
}

// Reads the action only, never the filesystem. A target it cannot resolve,
// such as a path held in a variable, yields no finding, so the classifier
// still judges it.
export function collectScopeFindings(
  action: Readonly<ScopeAction>,
  scope: Readonly<OwnedScope>,
  scratchPaths: readonly string[] = SCRATCH_PATHS,
): ScopeFinding[] {
  const filePath = action.input['file_path'] ?? action.input['notebook_path'];
  const command = action.input['command'];

  const findings = [
    ...(FILE_WRITE_TOOLS.has(action.tool) && typeof filePath === 'string'
      ? collectTargetFindings(action.cwd, filePath, scope, scratchPaths)
      : []),
    ...(action.tool.startsWith('mcp__') ? collectToolFindings(action, scope) : []),
    ...(action.tool === 'Bash' && typeof command === 'string'
      ? collectCommandFindings(command, action.cwd, action.cwd, scope, scratchPaths)
      : []),
  ];

  // Two merges share a target and differ in their grant, so a finding with
  // another grant, or with none, stays for the grant check.
  return findings.filter(
    (finding, index) =>
      findings.findIndex(
        (other) =>
          other.kind === finding.kind &&
          other.target === finding.target &&
          JSON.stringify(other.grant) === JSON.stringify(finding.grant),
      ) === index,
  );
}

const FILE_WRITE_TOOLS: ReadonlySet<string> = new Set([
  'Edit',
  'MultiEdit',
  'Write',
  'NotebookEdit',
]);

function collectToolFindings(
  action: Readonly<ScopeAction>,
  scope: Readonly<OwnedScope>,
): ScopeFinding[] {
  const verb = action.tool.split('__').at(-1) ?? '';

  if (!/merge|create|comment|update|delete|push|close|review/u.test(verb)) {
    return [];
  }

  const number =
    action.input['pullNumber'] ?? action.input['pull_number'] ?? action.input['issue_number'];

  const owner = action.input['owner'];
  const name = action.input['repo'];

  const repo =
    typeof owner === 'string' && typeof name === 'string' ? `${owner}/${name}` : undefined;

  const isOwned =
    !verb.includes('merge') &&
    typeof number === 'number' &&
    isOwnedPullRequest(number, repo, scope);

  if (isOwned) {
    return [];
  }

  return typeof number === 'number'
    ? [{ kind: 'remote-write', target: action.tool, grant: { kind: 'pull-request', number } }]
    : [{ kind: 'remote-write', target: action.tool }];
}

// A substitution or a shell's heredoc script runs commands of its own, so the
// check reads each one from the directory its segment runs in.
function collectCommandFindings(
  command: string,
  directory: string | null,
  cwd: string,
  scope: Readonly<OwnedScope>,
  scratchPaths: readonly string[],
): ScopeFinding[] {
  const findings: ScopeFinding[] = [];
  const entries = collectShellCommands(command, directory, scope.home);
  const piped = collectPipedSegments(command);
  const segments = splitShellCommand(command).segments;
  const scripts = collectShellScripts(command);

  for (const [index, entry] of entries.entries()) {
    const [name, ...args] = entry.words;
    const fixed = findFixedXargsCommand(entry.words, segments[index]?.text ?? '');

    if (fixed !== null) {
      findings.push(
        ...collectCallFindings(fixed.name, fixed.args, entry.directory, cwd, scope, scratchPaths),
      );
    } else if (isBranchSweep(entries.slice(0, index + 1), piped.slice(0, index + 1))) {
      findings.push({ kind: 'discard', target: 'git branch delete by exclusion' });
    }

    for (const target of entry.writeTargets) {
      findings.push(...collectTargetFindings(entry.directory, target, scope, scratchPaths));
    }

    if (name !== undefined && name !== 'cd') {
      findings.push(...collectCallFindings(name, args, entry.directory, cwd, scope, scratchPaths));
    }

    for (const script of scripts.filter((candidate) => candidate.segment === index)) {
      findings.push(
        ...collectCommandFindings(script.text, entry.directory, cwd, scope, scratchPaths),
      );
    }
  }

  return findings;
}

// One flag per segment: whether a pipe joins it to the segment before it. The
// segments are the runs of tokens between separators, as the shell split cuts them.
function collectPipedSegments(command: string): boolean[] {
  const piped: boolean[] = [];
  let separator: string | null = null;
  let isInSegment = false;

  for (const token of splitShellTokens(command).tokens) {
    if (token.kind === 'separator') {
      separator = token.operator;
      isInSegment = false;
    } else if (!isInSegment && token.kind !== 'comment' && token.kind !== 'heredoc') {
      piped.push(separator === '|');

      isInSegment = true;
    }
  }

  return piped;
}

const XARGS_FLAG = /^(?:-[0oprtx]+|--(?:null|no-run-if-empty|verbose|interactive|exit|open-tty))$/u;
const XARGS_VALUE_OPTION = /^-[EPads]$/u;

const XARGS_ATTACHED_VALUE =
  /^(?:-[EPads].|--(?:eof|max-procs|delimiter|arg-file|max-chars|process-slot-var)=)/u;

const XARGS_REPLACE = /^(?:-I(?<attached>.+)|-i(?<short>.*)|--replace(?:=(?<long>.*))?)$/u;

// The shell can expand, unquote or unescape a word into the replacement token,
// so only a segment written in plain literal words shows that the token is missing.
const PLAIN_WORD = /^(?:[\w./:@%+=-]|\{\})+$/u;

// In replacement mode xargs runs the command once per listed name, putting the
// name only where the token stands, so a command without the token runs as
// written. `-n` or `-L` beside it appends names again, so either one rules it out.
function findFixedXargsCommand(
  words: readonly string[],
  text: string,
): { readonly name: string; readonly args: readonly string[] } | null {
  if (
    words[0] !== 'xargs' ||
    !splitShellTokens(text).tokens.every(
      (token) =>
        token.kind !== 'word' || (token.raw === token.value && PLAIN_WORD.test(token.value)),
    )
  ) {
    return null;
  }

  let token: string | null = null;
  let start = 1;

  while (words[start]?.startsWith('-') === true) {
    const word = words[start] ?? '';
    const replace = XARGS_REPLACE.exec(word)?.groups;

    if (word === '--') {
      start += 1;
      break;
    }

    if (word === '-I') {
      token = words[start + 1] ?? null;
      start += 2;
    } else if (replace !== undefined) {
      const short = replace['short'];

      token =
        replace['attached'] ??
        replace['long'] ??
        (short === undefined || short === '' ? '{}' : short);

      start += 1;
    } else if (word.startsWith('-J')) {
      // BSD `-J` puts the names where its token stands, or after the command
      // when no word matches it, so the later of `-I` and `-J` decides the mode.
      token = null;
      start += word === '-J' ? 2 : 1;
    } else if (XARGS_VALUE_OPTION.test(word)) {
      start += 2;
    } else if (XARGS_FLAG.test(word) || XARGS_ATTACHED_VALUE.test(word)) {
      start += 1;
    } else {
      return null;
    }
  }

  const [name, ...args] = words.slice(start);

  if (
    token === null ||
    token === '' ||
    name === undefined ||
    [name, ...args].some((word) => word.includes(token))
  ) {
    return null;
  }

  return { name, args };
}

const XARGS_VALUE_OPTIONS = new Set(['-I', '-J', '-L', '-n', '-P', '-s', '-d', '-E']);

// A branch list that only drops names, piped into `git branch -d`, deletes
// branches no one named. A list that selects names by a pattern goes to the
// classifier, and so does a filter the check cannot read.
function isBranchSweep(entries: readonly ShellCommand[], piped: readonly boolean[]): boolean {
  const deleter = entries.at(-1)?.words ?? [];

  if (deleter[0] !== 'xargs' || piped.at(-1) !== true) {
    return false;
  }

  let start = 1;

  while (deleter[start]?.startsWith('-') === true) {
    // `xargs -a FILE` reads its names from the file, not from the pipe.
    if (/^(?:-a|--arg-file)/u.test(deleter[start] ?? '')) {
      return false;
    }

    start += XARGS_VALUE_OPTIONS.has(deleter[start] ?? '') ? 2 : 1;
  }

  const [program, subcommand, ...rest] = deleter.slice(start);

  if (
    program !== 'git' ||
    subcommand !== 'branch' ||
    !rest.some((word) => /^-(?:d|D|-delete)$/u.test(word))
  ) {
    return false;
  }

  let first = entries.length - 2;

  while (first > 0 && piped[first] === true) {
    first -= 1;
  }

  const [listing, ...filters] = entries.slice(first, -1).map((entry) => entry.words);

  return (
    listing !== undefined &&
    isWholeBranchListing(listing) &&
    filters.every((filter) => isExcludingFilter(filter))
  );
}

function isWholeBranchListing(words: readonly string[]): boolean {
  const [program, subcommand, ...rest] = words;

  if (program !== 'git') {
    return false;
  }

  if (subcommand === 'branch') {
    return rest.every((word) =>
      /^(?:-a|-r|-v|-vv|--all|--remotes|--no-color|--format=.*)$/u.test(word),
    );
  }

  if (subcommand !== 'for-each-ref') {
    return false;
  }

  // `--format` and `--sort` take their value as the next word, which names no
  // ref. Every other option, such as `--merged` or `--contains`, selects refs.
  const kept = rest.filter((_word, index) => !/^--(?:format|sort)$/u.test(rest[index - 1] ?? ''));

  return kept.every(
    (word) => /^--(?:format|sort)(?:=.*)?$/u.test(word) || /^refs\/heads\/?$/u.test(word),
  );
}

const NAME_EDITORS = new Set(['tr', 'cut', 'sort']);

function isExcludingFilter(words: readonly string[]): boolean {
  const [program, ...args] = words;

  if (program === 'grep' || program === 'egrep') {
    return args.some((word) => /^-[a-zA-Z]*v[a-zA-Z]*$|^--invert-match$/u.test(word));
  }

  if (program === 'sed') {
    return isSubstitutionOnly(args);
  }

  if (program === 'uniq') {
    return args.every((word) => !/^-[a-zA-Z]*[dDu]/u.test(word));
  }

  return program !== undefined && NAME_EDITORS.has(program);
}

// A sed script can delete or print by pattern, so only one substitution that
// rewrites each name, such as stripping the current-branch marker, passes.
function isSubstitutionOnly(args: readonly string[]): boolean {
  const scripts = args.filter((word) => word !== '-e' && word !== '-E' && word !== '-r');

  return (
    scripts.length > 0 &&
    scripts.every((script) =>
      /^s(?<delimiter>[^\w\s;])(?:(?!\k<delimiter>).)*\k<delimiter>(?:(?!\k<delimiter>).)*\k<delimiter>g?$/u.test(
        script,
      ),
    )
  );
}

function collectCallFindings(
  name: string,
  args: readonly string[],
  directory: string | null,
  cwd: string,
  scope: Readonly<OwnedScope>,
  scratchPaths: readonly string[],
): ScopeFinding[] {
  return [
    ...collectProgramFindings(name, args, { directory, cwd, scope, scratchPaths }),
    ...collectRecordFindings(name, args),
  ];
}

// The mod alone reports finished calls; a record the agent sends is a claim
// on scope it did not make, whether it names the bin, a runner, or the script.
// Any other program's operands, such as a rename's, run nothing.
function collectRecordFindings(name: string, args: readonly string[]): ScopeFinding[] {
  const words = [name, ...args];
  const isLaunched = RECORD_LAUNCHERS.has(name.slice(name.lastIndexOf('/') + 1));

  const program = words.findIndex(
    (word, index) => (index === 0 || isLaunched) && word.includes('auto-mode'),
  );

  return program !== -1 && words.slice(program + 1).includes('record')
    ? [{ kind: 'credential', target: 'auto-mode record' }]
    : [];
}

const RECORD_LAUNCHERS: ReadonlySet<string> = new Set([
  'bun',
  'bunx',
  'chrt',
  'command',
  'deno',
  'doas',
  'env',
  'exec',
  'flock',
  'ionice',
  'nice',
  'node',
  'nohup',
  'npm',
  'npx',
  'pnpm',
  'pnpx',
  'setsid',
  'stdbuf',
  'strace',
  'sudo',
  'taskset',
  'time',
  'timeout',
  'tsx',
  'unbuffer',
  'watch',
  'xargs',
  'yarn',
]);
