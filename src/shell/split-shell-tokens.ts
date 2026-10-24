import { collectTextTokens } from './collect-text-tokens.ts';
import type { ShellToken } from './types.ts';

export interface ShellTokens {
  readonly tokens: readonly ShellToken[];
  readonly substitutions: readonly string[];
  readonly hasSubstitution: boolean;
  readonly isUnterminated: boolean;
}

export function splitShellTokens(text: string): ShellTokens {
  const scanned = collectTextTokens(text, []);
  const literals: number[] = [];
  let recovered = scanned;

  while (recovered.unclosedAt !== null && !literals.includes(recovered.unclosedAt)) {
    literals.push(recovered.unclosedAt);

    recovered = collectTextTokens(text, literals);
  }

  return {
    tokens: scanned.tokens,
    substitutions: recovered.substitutions,
    hasSubstitution: scanned.hasSubstitution,
    isUnterminated: scanned.unclosedAt !== null,
  };
}
