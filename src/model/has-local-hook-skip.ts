import type { ActionRequest } from '../request/types.ts';
import { splitCommandWords } from '../shell/split-command-words.ts';
import { splitShellCommand } from '../shell/split-shell-command.ts';
import { splitShellTokens } from '../shell/split-shell-tokens.ts';
import { toWordValues } from '../shell/to-word-values.ts';
import { isLocalHookConfig } from './is-local-hook-config.ts';

export function hasLocalHookSkip(
  call: Pick<ActionRequest, 'toolName' | 'toolInput'>,
  current: string | null,
): boolean {
  const input = call.toolInput;

  if (call.toolName === 'Bash') {
    const command = input['command'];

    return typeof command === 'string' && isShellSkipWrite(command);
  }

  const path = input['file_path'];

  if (typeof path !== 'string' || !isLocalHookConfig(path)) {
    return false;
  }

  if (call.toolName === 'Write') {
    return collectSkipSettings(input['content']).length > 0;
  }

  if (call.toolName !== 'Edit') {
    return false;
  }

  const oldString = input['old_string'];
  const newString = input['new_string'];

  if (
    current === null ||
    typeof oldString !== 'string' ||
    typeof newString !== 'string' ||
    oldString === '' ||
    !current.includes(oldString)
  ) {
    return hasNewSetting(collectSkipSettings(oldString), newString);
  }

  const edited =
    input['replace_all'] === true
      ? current.replaceAll(oldString, () => newString)
      : current.replace(oldString, () => newString);

  return hasNewSetting(collectSkipSettings(current), edited);
}

// `>&2` and `2>&1` duplicate a descriptor and write no file.
const WRITE_REDIRECTS: ReadonlySet<string> = new Set(['>', '>>', '>|', '&>', '&>>']);

function isShellSkipWrite(command: string): boolean {
  const tokens = splitShellTokens(command).tokens;
  const words = tokens.flatMap((token) => toWordValues(token));

  const redirects = tokens.some(
    (token) =>
      token.kind === 'redirect' &&
      token.target !== null &&
      WRITE_REDIRECTS.has(token.operator.replace(/^\d+/u, '')) &&
      isLocalHookConfig(token.target),
  );

  const tees = words.includes('tee') && words.some((word) => isLocalHookConfig(word));

  const payload = [
    ...splitShellCommand(command).segments.map((segment) => buildWrittenText(segment.text)),
    ...tokens.flatMap((token) => (token.kind === 'heredoc' ? [token.body] : [])),
  ].join('\n');

  return (redirects || tees) && collectSkipSettings(payload).length > 0;
}

// printf fills its format from the words after it, and printf and `echo -e`
// turn `\n` and `\t` into a newline and a tab.
function buildWrittenText(text: string): string {
  const [program = '', format, ...args] = splitCommandWords(text);
  const words = splitShellTokens(text).tokens.flatMap((token) => toWordValues(token));

  const written =
    program.slice(program.lastIndexOf('/') + 1) === 'printf' && format !== undefined
      ? formatPrintf(format, args)
      : words.join('\n');

  return written.replaceAll(String.raw`\n`, '\n').replaceAll(String.raw`\t`, '\t');
}

// printf repeats its format until the arguments run out, and `%%` is a
// literal percent sign.
function formatPrintf(format: string, args: readonly string[]): string {
  const parts = format.split(/(?<spec>%%|%[-+ #0-9.]*[a-zA-Z])/u);
  const slots = parts.filter((part, index) => index % 2 === 1 && part !== '%%').length;
  const rounds = slots === 0 ? 1 : Math.max(1, Math.ceil(args.length / slots));

  return Array.from({ length: rounds }, (_, round) => {
    let slot = round * slots;

    return parts
      .map((part, index) => {
        if (index % 2 === 0) {
          return part;
        }

        if (part === '%%') {
          return '%';
        }

        slot += 1;

        return args[slot - 1] ?? '';
      })
      .join('');
  }).join('');
}

// The value is a bracketed list, or runs to the end of its line, a comma or a
// brace, and a YAML block list follows on the lines after it.
const SKIP_SETTING =
  /(?:^|[\s{,"'])(?<key>skip|exclude(?:_tags)?)["']?[ \t]*[:=][ \t]*(?<inline>\[[^\]\n]*\]|[^\n,}]*)(?<items>(?:\n[ \t]*-[^\n]*)*)/gu;

// lefthook runs a step whose skip is false and excludes nothing for an empty
// list or string.
const INACTIVE_VALUES: ReadonlySet<string> = new Set(['', 'false', '[]', 'null', '~']);

function collectSkipSettings(text: unknown): readonly string[] {
  if (typeof text !== 'string') {
    return [];
  }

  const uncommented = text
    .split('\n')
    .filter((line) => !/^\s*(?:#|\/\/)/u.test(line))
    .join('\n');

  return [...uncommented.matchAll(SKIP_SETTING)].flatMap((match) => {
    const key = match.groups?.['key'] ?? '';

    const items = (match.groups?.['items'] ?? '')
      .split('\n')
      .map((item) => item.trim())
      .filter((item) => item !== '');

    const value = (match.groups?.['inline'] ?? '')
      .replace(/\s#.*$/u, '')
      .trim()
      .replaceAll(/^["']|["']$/gu, '');

    if (value === '' && items.length > 0) {
      return [`${key}=${items.join(',')}`];
    }

    return INACTIVE_VALUES.has(value) ? [] : [`${key}=${value}`];
  });
}

// An Edit that keeps a setting as it was adds none, so each old setting
// cancels one equal new setting.
function hasNewSetting(old: readonly string[], text: unknown): boolean {
  const remaining = [...old];

  return collectSkipSettings(text).some((setting) => {
    const index = remaining.indexOf(setting);

    if (index === -1) {
      return true;
    }

    remaining.splice(index, 1);

    return false;
  });
}
