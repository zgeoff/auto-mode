// A word keeps its raw text beside its value with the quotes removed. A
// backslash keeps the character after it out of every operator, and both stay
// in the value. Offsets index the scanned text, end exclusive.
export type ShellToken =
  | {
      readonly kind: 'word';
      readonly value: string;
      readonly raw: string;
      readonly start: number;
      readonly end: number;
    }
  | {
      readonly kind: 'separator';
      readonly operator: string;
      readonly start: number;
      readonly end: number;
    }
  | {
      readonly kind: 'redirect';
      readonly operator: string;
      readonly target: string | null;
      readonly start: number;
      readonly end: number;
    }
  | {
      readonly kind: 'comment';
      readonly text: string;
      readonly start: number;
      readonly end: number;
    }
  | {
      readonly kind: 'heredoc';
      readonly body: string;
      readonly isQuoted: boolean;
      readonly opener: number;
      readonly substitutions: readonly string[];
      readonly start: number;
      readonly end: number;
    };

// The first unquoted parenthesis, as an offset into the value and the raw text.
export interface WordParen {
  readonly value: number;
  readonly raw: number;
}

export interface ScannedWord {
  readonly value: string;
  readonly raw: string;
  readonly end: number;
  readonly paren: WordParen | null;
  readonly isUnterminated: boolean;
}

export interface ScannedRedirect {
  readonly target: string | null;
  readonly raw: string;
  readonly end: number;
  readonly isUnterminated: boolean;
}

export interface Heredoc {
  readonly delimiter: string;
  readonly isQuoted: boolean;
  readonly stripsTabs: boolean;
  readonly opener: number;
}
