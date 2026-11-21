import { match } from 'ts-pattern';
import type { WordPart } from 'unbash';
import type { ShellWord } from './types.ts';

// Inside double quotes, a substitution or a braced expansion can open quotes
// of its own, so only a plain variable there stays one known word.
export function hasUnquotedExpansion(word: ShellWord): boolean {
  return word.parts.some((part) => isUnquotedExpansionPart(part));
}

function isUnquotedExpansionPart(part: WordPart): boolean {
  return match(part)
    .with(
      { type: 'SimpleExpansion' },
      { type: 'ParameterExpansion' },
      { type: 'CommandExpansion' },
      { type: 'ArithmeticExpansion' },
      { type: 'ProcessSubstitution' },
      () => true,
    )
    .with({ type: 'DoubleQuoted' }, { type: 'LocaleString' }, (quoted) =>
      quoted.parts.some((child) => child.type !== 'Literal' && child.type !== 'SimpleExpansion'),
    )
    .with({ type: 'Glob' }, { type: 'ExtendedGlob' }, { type: 'BraceExpansion' }, (pattern) =>
      (pattern.parts ?? []).some((child) => isUnquotedExpansionPart(child)),
    )
    .with({ type: 'Literal' }, { type: 'SingleQuoted' }, { type: 'AnsiCQuoted' }, () => false)
    .exhaustive();
}
