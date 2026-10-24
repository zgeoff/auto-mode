import { SCOPE_COMMANDS } from '../contract/scope-commands.ts';

// Options may sit between the program and its subcommand on a command line.
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
