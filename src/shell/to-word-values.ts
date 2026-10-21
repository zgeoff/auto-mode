import type { ShellToken } from './types.ts';

export function toWordValues(token: ShellToken): readonly string[] {
  return token.kind === 'word' ? [token.value] : [];
}
