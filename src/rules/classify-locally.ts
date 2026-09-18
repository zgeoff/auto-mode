import { isAbsolute, normalize, relative } from 'node:path';
import invariant from 'tiny-invariant';
import type { HookPayload } from '../harness/types.ts';
import {
  READ_ONLY_COMMANDS,
  READ_ONLY_GIT_SUBCOMMANDS,
  READ_ONLY_TOOLS,
  REGENERABLE_DIRS,
  SHELL_TOOLS,
} from './local-allowlists.ts';
import { splitShellCommand } from './split-shell-command.ts';

export type LocalVerdict =
  | { readonly kind: 'allow'; readonly exception: string }
  | { readonly kind: 'escalate' };

const ESCALATE: LocalVerdict = { kind: 'escalate' };

export function classifyLocally(payload: HookPayload): LocalVerdict {
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
  const start = words.findIndex((word) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word));

  if (start === -1) {
    // Only environment assignments, so nothing runs.
    return 'Read-only actions';
  }

  const head = words[start];

  invariant(head !== undefined, 'findIndex returned an index the array holds');

  const rest = words.slice(start + 1);
  const name = head.slice(head.lastIndexOf('/') + 1);

  if (READ_ONLY_COMMANDS.has(name)) {
    return 'Read-only actions';
  }

  if (name === 'git') {
    const sub = rest.find((word) => !word.startsWith('-'));

    return sub !== undefined && READ_ONLY_GIT_SUBCOMMANDS.has(sub) ? 'Read-only actions' : null;
  }

  if (name === 'rm') {
    return classifyRemove(rest, cwd);
  }

  return null;
}

function classifyRemove(args: readonly string[], cwd: string): string | null {
  const paths = args.filter((arg) => !arg.startsWith('-'));

  if (paths.length === 0) {
    return null;
  }

  for (const path of paths) {
    const stripped = toUnquoted(path);

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

function splitWords(text: string): readonly string[] {
  return text.split(/\s+/).filter((word) => word !== '');
}

function toUnquoted(word: string): string {
  const [first] = word;

  return (first === "'" || first === '"') && word.at(-1) === first ? word.slice(1, -1) : word;
}
