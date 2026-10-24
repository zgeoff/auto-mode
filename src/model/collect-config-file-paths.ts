import { isUnresolvedWord } from '../shell/is-unresolved-word.ts';
import { splitShellCommand } from '../shell/split-shell-command.ts';
import { splitShellTokens } from '../shell/split-shell-tokens.ts';
import { toWordValues } from '../shell/to-word-values.ts';

export function collectConfigFilePaths(command: string): readonly string[] {
  const values = splitShellCommand(command)
    .segments.flatMap((segment) =>
      splitShellTokens(segment.text).tokens.flatMap((token) => toWordValues(token)),
    )
    .flatMap((word) => {
      const value = /^GIT_CONFIG_(?:GLOBAL|SYSTEM)=(?<value>.*)$/su.exec(word)?.groups?.['value'];

      return value === undefined || isUnresolvedWord(value) || value.startsWith('~') ? [] : [value];
    });

  return [...new Set(values)];
}
