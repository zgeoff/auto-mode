import { match } from 'ts-pattern';
import type { WordPart } from 'unbash';
import type { ShellWord } from './types.ts';

// The shell expands a variable or a substitution inside double quotes too, but
// never inside single or ANSI-C quotes, and it keeps a double-quoted expansion
// as one word.
export function hasExpansion(word: ShellWord, reach: 'unquoted' | 'any'): boolean {
  return word.parts.some((part) => isExpansionPart(part, reach));
}

function isExpansionPart(part: WordPart, reach: 'unquoted' | 'any'): boolean {
  return match(part)
    .with(
      { type: 'SimpleExpansion' },
      { type: 'ParameterExpansion' },
      { type: 'CommandExpansion' },
      { type: 'ArithmeticExpansion' },
      { type: 'ProcessSubstitution' },
      () => true,
    )
    .with(
      { type: 'DoubleQuoted' },
      { type: 'LocaleString' },
      (quoted) => reach === 'any' && quoted.parts.some((child) => isExpansionPart(child, reach)),
    )
    .with({ type: 'Glob' }, { type: 'ExtendedGlob' }, { type: 'BraceExpansion' }, (pattern) =>
      (pattern.parts ?? []).some((child) => isExpansionPart(child, reach)),
    )
    .with({ type: 'Literal' }, { type: 'SingleQuoted' }, { type: 'AnsiCQuoted' }, () => false)
    .exhaustive();
}
