export interface ShellSegment {
  readonly text: string;
}

export function splitShellCommand(command: string): {
  readonly segments: readonly ShellSegment[];
  readonly hasUnparsedConstruct: boolean;
} {
  const segments: ShellSegment[] = [];
  let current = '';
  let quote: "'" | '"' | null = null;
  let unparsed = false;
  let i = 0;

  const collectSegment = (): void => {
    const text = current.trim();

    if (text !== '') {
      segments.push({ text });
    }

    current = '';
  };

  while (i < command.length) {
    const ch = command.charAt(i);

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
      collectSegment();

      i += 2;
      continue;
    }

    if (ch === ';' || ch === '|' || ch === '\n' || ch === '&') {
      collectSegment();

      i += 1;
      continue;
    }

    current += ch;
    i += 1;
  }

  collectSegment();

  return { segments, hasUnparsedConstruct: unparsed || quote !== null };
}
