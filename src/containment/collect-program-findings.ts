import type { OwnedScope } from '../scope/types.ts';
import { collectTargetFindings } from './collect-target-findings.ts';
import { PROGRAM_TABLE } from './program-table.ts';
import type {
  OperandSelector,
  OptionPattern,
  ProgramEntry,
  RuleFinding,
  WriteRule,
} from './program-table.ts';
import type { ScopeFinding } from './types.ts';

interface ProgramContext {
  readonly directory: string | null;
  readonly scope: Readonly<OwnedScope>;
  readonly scratchPaths: readonly string[];
}

// Reads one program call through its table entry. A program the table does not
// list writes nothing the check can name, so the classifier judges it.
export function collectProgramFindings(
  name: string,
  args: readonly string[],
  context: Readonly<ProgramContext>,
  table: Readonly<Record<string, ProgramEntry>> = PROGRAM_TABLE,
): ScopeFinding[] {
  const entry = findEntry(table, name);

  return entry === undefined
    ? []
    : collectEntryFindings(entry, [name], args, { ...context, call: [name, ...args] });
}

function findEntry(
  entries: Readonly<Record<string, ProgramEntry>> | undefined,
  name: string,
): ProgramEntry | undefined {
  return entries !== undefined && Object.hasOwn(entries, name) ? entries[name] : undefined;
}

interface EntryContext extends ProgramContext {
  readonly call: readonly string[];
}

function collectEntryFindings(
  entry: Readonly<ProgramEntry>,
  command: readonly string[],
  words: readonly string[],
  context: Readonly<EntryContext>,
): ScopeFinding[] {
  const call = splitProgramCall(entry, words);

  if (call.subcommand !== null) {
    return collectEntryFindings(
      call.subcommand.entry,
      [...command, call.subcommand.name],
      call.subcommand.words,
      context,
    );
  }

  return (entry.writes ?? [])
    .filter((rule) => isRuleApplied(rule, call, words))
    .flatMap((rule) => collectRuleFindings(rule, call, command, context));
}

interface CallOption {
  readonly name: string;
  readonly value: string | undefined;
}

interface ProgramCall {
  readonly options: readonly CallOption[];
  readonly operands: readonly string[];
  readonly subcommand: {
    readonly name: string;
    readonly entry: ProgramEntry;
    readonly words: readonly string[];
  } | null;
}

function splitProgramCall(entry: Readonly<ProgramEntry>, words: readonly string[]): ProgramCall {
  const options: CallOption[] = [];
  const operands: string[] = [];
  let isOptionsEnd = false;

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index] ?? '';

    if (isOptionsEnd || !word.startsWith('-') || word === '-') {
      const subcommand = operands.length === 0 ? findSubcommand(entry, word) : undefined;

      if (subcommand !== undefined) {
        return {
          options,
          operands,
          subcommand: { name: word, entry: subcommand, words: words.slice(index + 1) },
        };
      }

      operands.push(word);

      isOptionsEnd ||= entry.optionsEndAtOperand === true;
    } else if (word === '--') {
      isOptionsEnd = true;
    } else {
      const split = splitOption(entry.valueOptions ?? [], word, words[index + 1]);

      options.push(...split.options);

      index += split.isValueNext ? 1 : 0;
    }
  }

  return { options, operands, subcommand: null };
}

function findSubcommand(entry: Readonly<ProgramEntry>, word: string): ProgramEntry | undefined {
  const other = entry.otherSubcommand;

  return (
    findEntry(entry.subcommands, word) ??
    (other !== undefined && (other.pattern?.test(word) ?? true) ? other.entry : undefined)
  );
}

function splitOption(
  valueOptions: readonly OptionPattern[],
  word: string,
  next: string | undefined,
): { readonly options: readonly CallOption[]; readonly isValueNext: boolean } {
  for (const pattern of valueOptions) {
    if (typeof pattern !== 'string') {
      if (pattern.test(word)) {
        return { options: [{ name: word, value: next }], isValueNext: true };
      }
    } else if (word === pattern) {
      return { options: [{ name: pattern, value: next }], isValueNext: true };
    } else if (
      pattern.startsWith('--') ? word.startsWith(`${pattern}=`) : word.startsWith(pattern)
    ) {
      const value = word.slice(pattern.length).replace(/^=/u, '');

      return { options: [{ name: pattern, value }], isValueNext: false };
    }
  }

  return splitOptionCluster(valueOptions, word, next);
}

// A short cluster such as `-Dc` sets each flag before its first value option,
// which takes the rest of the cluster, or the next word when nothing follows.
function splitOptionCluster(
  valueOptions: readonly OptionPattern[],
  word: string,
  next: string | undefined,
): { readonly options: readonly CallOption[]; readonly isValueNext: boolean } {
  const letters = /^-[^-]./u.test(word) ? [...word].slice(1) : [];
  const at = letters.findIndex((letter) => valueOptions.includes(`-${letter}`));

  if (at === -1) {
    return { options: [{ name: word, value: undefined }], isValueNext: false };
  }

  const attached = word.slice(at + 2);
  const flags = letters.slice(0, at).map((letter) => ({ name: `-${letter}`, value: undefined }));

  return {
    options: [
      ...flags,
      { name: `-${letters[at] ?? ''}`, value: attached === '' ? next : attached },
    ],
    isValueNext: attached === '',
  };
}

function isRuleApplied(
  rule: Readonly<WriteRule>,
  call: Readonly<ProgramCall>,
  words: readonly string[],
): boolean {
  const optionValue = rule.optionValue;

  return (
    (rule.flags === undefined || hasOption(call, rule.flags)) &&
    !hasOption(call, rule.readFlags ?? []) &&
    (rule.words ?? []).every((pattern) => words.some((word) => pattern.test(word))) &&
    (optionValue === undefined ||
      call.options.some(
        (option) =>
          optionValue.options.includes(option.name) &&
          option.value !== undefined &&
          optionValue.value.test(option.value),
      ))
  );
}

function hasOption(call: Readonly<ProgramCall>, patterns: readonly OptionPattern[]): boolean {
  return call.options.some((option) =>
    patterns.some((pattern) =>
      typeof pattern === 'string' ? option.name === pattern : pattern.test(option.name),
    ),
  );
}

function collectRuleFindings(
  rule: Readonly<WriteRule>,
  call: Readonly<ProgramCall>,
  command: readonly string[],
  context: Readonly<EntryContext>,
): ScopeFinding[] {
  const finding =
    rule.finding === undefined ? null : buildFinding(rule.finding, command, context.call);

  if (rule.options === undefined && rule.operands === undefined) {
    return finding === null ? [] : [finding];
  }

  const targets = [
    ...call.options.flatMap((option) =>
      rule.options?.includes(option.name) === true && option.value !== undefined
        ? [option.value]
        : [],
    ),
    ...(rule.operands ?? []).flatMap((selector) => pickOperands(selector, rule, call)),
  ];

  const resolve = (target: string): ScopeFinding[] =>
    collectTargetFindings(context.directory, target, context.scope, context.scratchPaths);

  if (rule.role === undefined || rule.role === 'path') {
    return targets.flatMap((target) => resolve(target));
  }

  if (finding === null) {
    return [];
  }

  if (rule.role === 'remote-path') {
    return targets.flatMap((target) => (/^[^/]+:/u.test(target) ? [finding] : resolve(target)));
  }

  if (rule.role === 'url') {
    return isLocalUpload(targets) ? [] : [finding];
  }

  return isRemoteRead(targets, rule.reads ?? []) ? [] : [finding];
}

function buildFinding(
  finding: Readonly<RuleFinding>,
  command: readonly string[],
  call: readonly string[],
): ScopeFinding {
  const target = finding.target ?? (finding.quote === 'call' ? call : command).join(' ');

  return { kind: finding.kind, target };
}

function pickOperands(
  selector: OperandSelector,
  rule: Readonly<WriteRule>,
  call: Readonly<ProgramCall>,
): readonly string[] {
  const operands = call.operands;
  const isNamed = hasOption(call, rule.options ?? []);

  if (selector === 'all') {
    return operands;
  }

  if (selector === 'first') {
    return operands.slice(0, 1);
  }

  if (selector === 'after-script') {
    return hasOption(call, rule.scriptOptions ?? []) ? operands : operands.slice(1);
  }

  if (isNamed) {
    return selector === 'sources' ? operands : [];
  }

  if (operands.length < 2) {
    return [];
  }

  return selector === 'destination' ? operands.slice(-1) : operands.slice(0, -1);
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);

function isLocalUpload(words: readonly string[]): boolean {
  const hosts = words
    .filter((word) => /^(?:https?:\/\/|localhost\b|127\.)/u.test(word))
    .map(
      (word) =>
        /^(?:https?:\/\/)?(?<host>\[[^\]]+\]|[^/:?#\s]+)/u
          .exec(word)
          ?.groups?.['host']?.toLowerCase() ?? '',
    );

  return hosts.length > 0 && hosts.every((host) => LOCAL_HOSTS.has(host));
}

// A remote command that is one read-only program, with no shell operators or
// newlines, changes nothing on the host. A call with no host runs nothing.
function isRemoteRead(words: readonly string[], reads: readonly string[]): boolean {
  const [host, ...remote] = words;

  if (host === undefined) {
    return true;
  }

  const command = remote.join(' ');
  const [program] = command.trim().split(/\s+/u);

  return reads.includes(program ?? '') && !/[;&|<>`\n\r]|\$\(/u.test(command);
}
