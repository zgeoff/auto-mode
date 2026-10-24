import { join, relative, resolve } from 'node:path';
import { parseConfigParameters } from '../git/parse-config-parameters.ts';
import { parseGitBoolean } from '../git/parse-git-boolean.ts';
import { resolveConfigFilePath } from '../git/resolve-config-file-path.ts';
import type { HookFacts } from '../git/types.ts';
import { hasExpansion } from '../shell/has-expansion.ts';
import { hasUnquotedExpansion } from '../shell/has-unquoted-expansion.ts';
import { isUnresolvedWord } from '../shell/is-unresolved-word.ts';
import { splitCommandWords } from '../shell/split-command-words.ts';
import type { GitConfigOption } from '../shell/split-git-command.ts';
import { splitGitCommand } from '../shell/split-git-command.ts';
import { splitShellCommand } from '../shell/split-shell-command.ts';
import { splitShellTokens } from '../shell/split-shell-tokens.ts';
import { toWordValues } from '../shell/to-word-values.ts';
import { findNoVerifyOption } from './find-no-verify-option.ts';
import { HIDDEN_GIT_WORDS } from './hidden-git-words.ts';

export function collectHookBypasses(
  command: string,
  cwd: string,
  facts: HookFacts | null,
): readonly string[] {
  const exported = new Map<string, string>();

  const bypasses: string[] = [];
  let segmentFacts = facts;

  for (const segment of splitShellCommand(command).segments) {
    const found = collectSegmentBypasses(segment.text, exported, cwd, segmentFacts);

    if (found === 'moved') {
      segmentFacts = null;
    } else {
      bypasses.push(...found);
    }
  }

  return bypasses;
}

// The gh stack commands that commit or push through git, and so run its hooks.
const GH_STACK_WRITES: ReadonlySet<string> = new Set(['add', 'push', 'submit', 'sync']);
const DIRECTORY_CHANGES: ReadonlySet<string> = new Set(['cd', 'pushd', 'popd']);

function collectSegmentBypasses(
  text: string,
  exported: Map<string, string>,
  cwd: string,
  facts: HookFacts | null,
): readonly string[] | 'moved' {
  const tokens = splitShellTokens(text).tokens;
  const words = tokens.flatMap((token) => toWordValues(token));
  const raws = tokens.flatMap((token) => (token.kind === 'word' ? [token.raw] : []));
  const program = splitCommandWords(text);
  const [name = '', ...args] = program;
  const prefix = words.slice(0, words.length - program.length);
  const programName = name.slice(name.lastIndexOf('/') + 1);

  if (DIRECTORY_CHANGES.has(programName)) {
    return 'moved';
  }

  if (programName === 'export' && prefix.length === 0) {
    for (const arg of args.filter((word) => /^\w+=/u.test(word))) {
      exported.set(arg.slice(0, arg.indexOf('=')), arg);
    }

    return [];
  }

  // A bare assignment changes a variable the shell already exports.
  if (program.length === 0) {
    for (const word of prefix.filter((entry) => /^\w+=/u.test(entry))) {
      const variable = word.slice(0, word.indexOf('='));

      if (exported.has(variable)) {
        exported.set(variable, word);
      }
    }

    return [];
  }

  if (programName === 'unset' && prefix.length === 0) {
    for (const arg of args) {
      exported.delete(arg);
    }

    return [];
  }

  const reaching = buildReachingVariables(prefix, exported);
  const checkoutFacts = hasCheckoutOverride(reaching) ? null : facts;

  if (programName === 'gh') {
    return args[0] === 'stack' && GH_STACK_WRITES.has(args[1] ?? '')
      ? collectHookSwitches(reaching, [], checkoutFacts)
      : [];
  }

  if (programName !== 'git') {
    return [];
  }

  const git = splitGitCommand(args, cwd, '');
  const [subcommand = '', ...subArgs] = git.args;
  const writing = subcommand === 'commit' || subcommand === 'push' ? subcommand : null;
  const globals = args.slice(0, args.length - git.args.length);

  if (writing === null && !hasExpansion(raws[prefix.length + globals.length + 1] ?? '', 'any')) {
    return [];
  }

  // A -C into a subfolder can enter a nested repository, so only the cwd
  // keeps the checkout the facts describe.
  const isSameCheckout =
    git.directory === cwd && !globals.some((arg) => /^--(?:git-dir|work-tree)(?:=|$)/u.test(arg));

  const gitFacts = isSameCheckout ? checkoutFacts : null;

  const option =
    writing === null
      ? HIDDEN_GIT_WORDS.subcommand
      : findNoVerifyOption(subArgs, raws.slice(prefix.length + globals.length + 2), writing);

  // An unquoted expansion can split into several words, and so end git's
  // options early: a later `-c` then lands in the subcommand's arguments.
  const hasSplitGlobal = raws
    .slice(prefix.length + 1, prefix.length + 1 + globals.length)
    .some((raw) => hasUnquotedExpansion(raw));

  const config = hasSplitGlobal ? null : git.config;

  return [...collectHookSwitches(reaching, config, gitFacts), ...(option === null ? [] : [option])];
}

// The words before the program set and unset variables in order, over what an
// earlier export left: a later assignment replaces an earlier one, and
// `env -u NAME` removes it, so only the last state of each name reaches git.
function buildReachingVariables(
  prefix: readonly string[],
  exported: ReadonlyMap<string, string>,
): ReadonlyMap<string, string> {
  const reaching = new Map(exported);

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

  return reaching;
}

const CHECKOUT_OVERRIDES = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR'];

function hasCheckoutOverride(reaching: ReadonlyMap<string, string>): boolean {
  return CHECKOUT_OVERRIDES.some((name) => reaching.has(name));
}

// lefthook skips its hooks for `0` or `false`, and husky for `0` alone. lefthook
// leaves out each step or tag that LEFTHOOK_EXCLUDE names. lefthook 2.2.1 reads
// no LEFTHOOK_SKIP, so an agent that sets it means to leave a step out.
const HOOK_SWITCH_NAMES = [
  'LEFTHOOK',
  'HUSKY',
  'LEFTHOOK_EXCLUDE',
  'LEFTHOOK_SKIP',
  'LEFTHOOK_CONFIG',
  'LEFTHOOK_BIN',
] as const;

const CONFIG_FILE_VARIABLES = [
  'GIT_CONFIG_SYSTEM',
  'GIT_CONFIG_NOSYSTEM',
  'GIT_CONFIG_GLOBAL',
] as const;

function collectHookSwitches(
  reaching: ReadonlyMap<string, string>,
  config: readonly GitConfigOption[] | null,
  facts: HookFacts | null,
): readonly string[] {
  const switches = HOOK_SWITCH_NAMES.flatMap((name) => {
    const word = reaching.get(name);

    const label =
      word === undefined ? null : findSwitchLabel(name, word.slice(name.length + 1), facts);

    return label === null ? [] : [label];
  });

  const hooksPath = findHooksPath(reaching, config);

  if (hooksPath !== undefined) {
    return isKeptHooksPath(hooksPath, facts) ? switches : [...switches, 'core.hooksPath'];
  }

  const fileVariables = CONFIG_FILE_VARIABLES.filter((name) => reaching.has(name));

  return fileVariables.length === 0 || isKeptConfigFiles(reaching, facts)
    ? switches
    : [...switches, ...fileVariables];
}

function findSwitchLabel(name: string, value: string, facts: HookFacts | null): string | null {
  if (name === 'LEFTHOOK' && (value === '0' || value === 'false')) {
    return `LEFTHOOK=${value}`;
  }

  if (name === 'HUSKY' && value === '0') {
    return 'HUSKY=0';
  }

  if ((name === 'LEFTHOOK_EXCLUDE' || name === 'LEFTHOOK_SKIP') && /[^\s,]/u.test(value)) {
    return name;
  }

  // lefthook loads its usual config for an empty LEFTHOOK_CONFIG, and reads a
  // relative one from the worktree root.
  if (
    name === 'LEFTHOOK_CONFIG' &&
    value !== '' &&
    (facts === null ||
      facts.lefthookConfig === null ||
      !isResolvableWord(value) ||
      resolve(facts.worktree, value) !== facts.lefthookConfig)
  ) {
    return name;
  }

  if (name === 'LEFTHOOK_BIN' && !isKeptLefthookBinary(value, facts)) {
    return name;
  }

  return null;
}

function isResolvableWord(value: string): boolean {
  return !isUnresolvedWord(value) && !value.startsWith('~');
}

// lefthook's hook script runs a non-empty LEFTHOOK_BIN in place of its own
// lookup, which tries `lefthook` on PATH and then the worktree's packages. The
// hook runs at the worktree root, so a relative path reads from there.
const LEFTHOOK_PACKAGE_BINARY =
  /^(?:\.(?:bun|pnpm)\/[^/]+\/node_modules\/)?(?:\.bin\/lefthook|lefthook\/bin\/index\.js|lefthook-[\da-z]+-[\da-z]+\/bin\/lefthook(?:\.exe)?|@evilmartians\/lefthook\/bin\/lefthook-[\da-z]+-[\da-z]+\/lefthook(?:\.exe)?|@evilmartians\/lefthook-installer\/bin\/lefthook)$/u;

function isKeptLefthookBinary(value: string, facts: HookFacts | null): boolean {
  if (value === '' || value === 'lefthook') {
    return true;
  }

  if (facts === null || !isResolvableWord(value)) {
    return false;
  }

  return LEFTHOOK_PACKAGE_BINARY.test(
    relative(join(facts.worktree, 'node_modules'), resolve(facts.worktree, value)),
  );
}

// git reads the GIT_CONFIG_COUNT variables, then GIT_CONFIG_PARAMETERS, then
// each `-c` or `--config-env`, and the last setting wins. An unset
// `--config-env` variable, or a key or count the shell expands, is unknown.
function findHooksPath(
  reaching: ReadonlyMap<string, string>,
  config: readonly GitConfigOption[] | null,
): string | null | undefined {
  if (config === null) {
    return null;
  }

  const fromOptions = config.flatMap((option) => {
    const separator = option.setting.indexOf('=');
    const key = separator === -1 ? option.setting : option.setting.slice(0, separator);

    if (isUnresolvedWord(key)) {
      return [null];
    }

    if (separator === -1 || !isHooksPathKey(key)) {
      return [];
    }

    const value = option.setting.slice(separator + 1);

    if (option.source === 'value') {
      return [value];
    }

    const word = reaching.get(value);

    return [word === undefined ? null : word.slice(value.length + 1)];
  });

  const parametersWord =
    reaching.get('GIT_CONFIG_PARAMETERS')?.slice('GIT_CONFIG_PARAMETERS='.length) ?? '';

  // The shell expands a variable anywhere in GIT_CONFIG_PARAMETERS before git
  // parses it, and the expansion can close one quoted word and open another.
  // git refuses to run with one it cannot parse.
  const fromParameters = isUnresolvedWord(parametersWord)
    ? [null]
    : (parseConfigParameters(parametersWord) ?? [])
        .filter((parameter) => isHooksPathKey(parameter.key))
        .map((parameter) => parameter.value);

  const fromCommand = [...fromParameters, ...fromOptions];

  if (fromCommand.length > 0) {
    return fromCommand.at(-1);
  }

  const countWord = findVariableValue(reaching, 'GIT_CONFIG_COUNT');

  if (countWord !== undefined && isUnresolvedWord(countWord)) {
    return null;
  }

  const count = Number(countWord);

  const fromVariables = [...reaching.entries()]
    .flatMap(([name, word]): readonly { index: number; value: string | null }[] => {
      const index = Number(/^GIT_CONFIG_KEY_(?<index>0|[1-9]\d*)$/u.exec(name)?.groups?.['index']);
      const key = word.slice(name.length + 1);
      const value = findVariableValue(reaching, `GIT_CONFIG_VALUE_${index}`);

      if (!(index < count) || value === undefined) {
        return [];
      }

      if (isUnresolvedWord(key)) {
        return [{ index, value: null }];
      }

      return isHooksPathKey(key) ? [{ index, value }] : [];
    })
    .toSorted((left, right) => left.index - right.index);

  return fromVariables.at(-1)?.value;
}

// git reads a config key's section and name without case.
function isHooksPathKey(key: string): boolean {
  return key.toLowerCase() === 'core.hookspath';
}

function findVariableValue(
  reaching: ReadonlyMap<string, string>,
  name: string,
): string | undefined {
  return reaching.get(name)?.slice(name.length + 1);
}

// An empty core.hooksPath runs no hooks. git reads a relative one from the
// worktree root.
function isKeptHooksPath(value: string | null, facts: HookFacts | null): boolean {
  return (
    value !== null &&
    value !== '' &&
    facts !== null &&
    isResolvableWord(value) &&
    resolve(facts.worktree, value) === facts.hooksDirectory
  );
}

// git reads the system config, then the user's, then the repository's, and the
// last core.hooksPath wins. A variable takes the place of its layer's file.
function isKeptConfigFiles(
  reaching: ReadonlyMap<string, string>,
  facts: HookFacts | null,
): boolean {
  if (facts === null) {
    return false;
  }

  // A layer that sets the hooks folder hides every layer git reads before it,
  // so an unknown lower layer changes nothing.
  if (facts.layerHooks.repository !== null) {
    return facts.layerHooks.repository === facts.hooksDirectory;
  }

  const global = findLayerHooks(
    findVariableValue(reaching, 'GIT_CONFIG_GLOBAL'),
    facts.layerHooks.global,
    facts,
  );

  if (global !== null) {
    return global === facts.hooksDirectory;
  }

  const system = findSystemLayerHooks(reaching, facts);

  return system !== undefined && (system ?? facts.defaultHooksDirectory) === facts.hooksDirectory;
}

function findLayerHooks(
  value: string | undefined,
  sessionHooks: string | null,
  facts: HookFacts,
): string | null | undefined {
  if (value === undefined) {
    return sessionHooks;
  }

  return isResolvableWord(value)
    ? facts.configFileHooks[resolveConfigFilePath(value, facts.worktree)]
    : undefined;
}

// A session that skips the system config leaves its hooks folder unread, so
// a command that turns the system config back on sets one the facts lack.
function findSystemLayerHooks(
  reaching: ReadonlyMap<string, string>,
  facts: HookFacts,
): string | null | undefined {
  const noSystem = findVariableValue(reaching, 'GIT_CONFIG_NOSYSTEM');
  const system = findVariableValue(reaching, 'GIT_CONFIG_SYSTEM');

  if (noSystem === undefined) {
    return findLayerHooks(system, facts.layerHooks.system, facts);
  }

  if (isUnresolvedWord(noSystem)) {
    return undefined;
  }

  if (parseGitBoolean(noSystem) === true) {
    return null;
  }

  return system === undefined ? undefined : findLayerHooks(system, null, facts);
}
