import { isUnresolvedWord } from '../shell/is-unresolved-word.ts';
import { parseShellCommand } from '../shell/parse-shell-command.ts';

export function collectConfigFilePaths(command: string): readonly string[] {
  const values = parseShellCommand(command)
    .segments.flatMap((segment) => segment.words.map((word) => word.value))
    .flatMap((word) => {
      const value = /^GIT_CONFIG_(?:GLOBAL|SYSTEM)=(?<value>.*)$/su.exec(word)?.groups?.['value'];

      return value === undefined || isUnresolvedWord(value) || value.startsWith('~') ? [] : [value];
    });

  return [...new Set(values)];
}
