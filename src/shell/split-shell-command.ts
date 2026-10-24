import { splitShellTokens } from './split-shell-tokens.ts';

export interface ShellSegment {
  readonly text: string;
  readonly start: number;
  readonly end: number;
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
        segments.push({ text: command.slice(start, end), start, end });
      }

      start = null;
    } else if (token.kind !== 'comment' && token.kind !== 'heredoc') {
      start ??= token.start;
      end = token.end;
    }
  }

  const hasUnparsedConstruct =
    scanned.hasSubstitution ||
    scanned.isUnterminated ||
    scanned.tokens.some((token) => token.kind === 'redirect' && token.operator.includes('>'));

  return { segments, hasUnparsedConstruct };
}
