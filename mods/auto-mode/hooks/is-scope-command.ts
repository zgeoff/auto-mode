import { SCOPE_COMMANDS } from '../contract/scope-commands.ts';

// A cheap gate before the record subprocess: options may sit between the
// program and its subcommand, and the CLI parses the words exactly.
const SCOPE_COMMAND_PATTERN = new RegExp(
  Object.entries(SCOPE_COMMANDS)
    .map(([program, commands]) => {
      const alternatives = commands.map((command) => command.split(' ').join(String.raw`\s+`));

      return String.raw`\b${program}\s[^\n]*?\b(?:${alternatives.join('|')})\b`;
    })
    .join('|'),
  'u',
);

export function isScopeCommand(command: string): boolean {
  return SCOPE_COMMAND_PATTERN.test(command);
}
