import type { WordPart } from 'unbash';

export interface ShellWord {
  readonly raw: string;
  readonly value: string;
  readonly parts: readonly WordPart[];
  readonly hasError: boolean;
}

interface ShellHeredoc {
  readonly body: string;
  readonly isQuoted: boolean;
  readonly substitutions: readonly string[];
}

export interface ShellRedirect {
  readonly operator: string;
  readonly descriptor: number | null;
  readonly target: string | null;
  readonly heredoc: ShellHeredoc | null;
  readonly start: number;
}

export interface ShellScope {
  readonly id: number;
  readonly kind: 'subshell' | 'conditional';
}

export interface ShellSegment {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly words: readonly ShellWord[];
  readonly redirects: readonly ShellRedirect[];
  readonly substitutions: readonly string[];
  readonly isPiped: boolean;
  readonly scopes: readonly ShellScope[];
}

export interface ShellCommandTree {
  readonly segments: readonly ShellSegment[];
  readonly hasError: boolean;
  readonly hasSubstitution: boolean;
  readonly hasCompound: boolean;
  readonly hasPipe: boolean;
}
