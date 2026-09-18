/** One command in a chain, with the operator that introduced it dropped. */
export interface ShellSegment {
  readonly text: string;
}

/**
 * Splits a shell command on the operators that chain separate commands, so each
 * one can be judged on its own. Quoted text is left alone: `echo "a && b"` is
 * one command, not two.
 *
 * This is deliberately not a shell parser. It recognises enough to decide
 * whether every part of a command is plainly read-only; anything it cannot
 * account for is reported through `hasUnparsedConstruct`, and the caller then
 * declines to judge locally rather than guessing.
 */
export function splitShellCommand(command: string): {
  readonly segments: readonly ShellSegment[];
  readonly hasUnparsedConstruct: boolean;
} {
  const segments: ShellSegment[] = [];

  let current = '';
  let quote: "'" | '"' | null = null;
  let unparsed = false;
  let i = 0;

  const push = (): void => {
    const text = current.trim();

    if (text !== '') {
      segments.push({ text });
    }

    current = '';
  };

  while (i < command.length) {
    const ch = command[i] as string;

    if (quote !== null) {
      // A double-quoted string still expands `$(…)` and backticks, so a
      // substitution inside one is as opaque as a bare one.
      if (quote === '"' && (command.startsWith('$(', i) || ch === '`')) {
        unparsed = true;
      }

      if (ch === quote) {
        quote = null;
      }

      current += ch;
      i += 1;
      continue;
    }

    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      i += 1;
      continue;
    }

    if (ch === '\\') {
      current += command.slice(i, i + 2);
      i += 2;
      continue;
    }

    // Substitution, process substitution, and redirection can each hide an
    // effect the segment text does not show.
    if (command.startsWith('$(', i) || ch === '`' || command.startsWith('<(', i) || ch === '>') {
      unparsed = true;
      current += ch;
      i += 1;
      continue;
    }

    if (command.startsWith('&&', i) || command.startsWith('||', i)) {
      push();
      i += 2;
      continue;
    }

    if (ch === ';' || ch === '|' || ch === '\n' || ch === '&') {
      push();
      i += 1;
      continue;
    }

    current += ch;
    i += 1;
  }

  push();

  return { segments, hasUnparsedConstruct: unparsed || quote !== null };
}
