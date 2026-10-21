import type { ActionRequest } from '../request/types.ts';
import { splitShellTokens } from '../shell/split-shell-tokens.ts';
import { toWordValues } from '../shell/to-word-values.ts';

// lefthook merges its local config over the shared one, in YAML, JSON, JSONC or
// TOML, with or without a leading dot.
const LOCAL_CONFIG = /(?:^|\/)\.?lefthook-local\.(?:ya?ml|jsonc?|toml)$/iu;

export function hasLocalHookSkip(call: Pick<ActionRequest, 'toolName' | 'toolInput'>): boolean {
  const input = call.toolInput;

  if (call.toolName === 'Bash') {
    const command = input['command'];

    return typeof command === 'string' && isShellSkipWrite(command);
  }

  const path = input['file_path'];

  if (typeof path !== 'string' || !LOCAL_CONFIG.test(path)) {
    return false;
  }

  if (call.toolName === 'Write') {
    return collectSkipSettings(input['content']).length > 0;
  }

  if (call.toolName === 'Edit') {
    return hasNewSetting(collectSkipSettings(input['old_string']), input['new_string']);
  }

  return false;
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
      LOCAL_CONFIG.test(token.target),
  );

  const tees = words.includes('tee') && words.some((word) => LOCAL_CONFIG.test(word));

  return (redirects || tees) && collectSkipSettings(command).length > 0;
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
