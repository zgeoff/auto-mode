import { splitShellTokens } from './split-shell-tokens.ts';

export interface ShellSegment {
  readonly text: string;
}

export function splitShellCommand(command: string): {
  readonly segments: readonly ShellSegment[];
  readonly hasUnparsedConstruct: boolean;
} {
  const scanned = splitShellTokens(command);
  const segments: ShellSegment[] = [];
  let start: number | null = null;
  let end = 0;

  for (const token of [...scanned.tokens, null]) {
    if (token === null || token.kind === 'separator') {
      if (start !== null) {
        segments.push({ text: command.slice(start, end) });
      }

      start = null;
    } else {
      start ??= token.start;
      end = token.end;
    }
  }

  // Substitution, process substitution, and output redirection can each hide
  // an effect the segment text does not show.
  const hasUnparsedConstruct =
    scanned.hasSubstitution ||
    scanned.isUnterminated ||
    scanned.tokens.some((token) => token.kind === 'redirect' && token.operator.includes('>'));

  return { segments, hasUnparsedConstruct };
}
