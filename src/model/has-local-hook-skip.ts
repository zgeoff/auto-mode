import type { ActionRequest } from '../request/types.ts';
import { splitShellTokens } from '../shell/split-shell-tokens.ts';

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
    return countSkipSettings(input['content']) > 0;
  }

  if (call.toolName === 'Edit') {
    return countSkipSettings(input['new_string']) > countSkipSettings(input['old_string']);
  }

  return false;
}

// `>&2` and `2>&1` duplicate a descriptor and write no file.
const WRITE_REDIRECTS: ReadonlySet<string> = new Set(['>', '>>', '>|', '&>', '&>>']);

function isShellSkipWrite(command: string): boolean {
  const tokens = splitShellTokens(command).tokens;
  const words = tokens.flatMap((token) => (token.kind === 'word' ? [token.value] : []));

  const redirects = tokens.some(
    (token) =>
      token.kind === 'redirect' &&
      token.target !== null &&
      WRITE_REDIRECTS.has(token.operator.replace(/^\d+/u, '')) &&
      LOCAL_CONFIG.test(token.target),
  );

  const tees = words.includes('tee') && words.some((word) => LOCAL_CONFIG.test(word));

  return (redirects || tees) && countSkipSettings(command) > 0;
}

// A `skip: false` setting runs the step, so it adds no skip.
const SKIP_SETTING = /(?:^|[\s{,"'])(?:skip|exclude(?:_tags)?)["']?\s*[:=](?![\s"']*false\b)/gu;

function countSkipSettings(text: unknown): number {
  return typeof text === 'string' ? [...text.matchAll(SKIP_SETTING)].length : 0;
}
