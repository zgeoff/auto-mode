interface SecretWindow {
  readonly start: string;
  readonly maxNewlines: number;
}

export interface SecretPattern {
  readonly source: string;
  readonly flags: string;
  readonly engine: 'js' | 're2';
  readonly window?: SecretWindow;
}

export type FilterField = 'secret' | 'match' | 'line' | 'path';

export type FilterTerm =
  | { readonly kind: 'entropy'; readonly op: '<' | '<='; readonly value: number }
  | {
      readonly kind: 'matches';
      readonly field: FilterField;
      readonly patterns: readonly SecretPattern[];
      readonly negate: boolean;
    }
  | {
      readonly kind: 'contains';
      readonly field: FilterField;
      readonly values: readonly string[];
      readonly negate: boolean;
    };

export interface SecretRule {
  readonly id: string;
  readonly pattern: SecretPattern | null;
  readonly path: SecretPattern | null;
  readonly keywords: readonly string[];
  readonly secretGroup: number;
  readonly filter: readonly FilterTerm[];
  readonly report: boolean;
}

export interface SecretRuleSet {
  readonly source: {
    readonly repository: string;
    readonly version: string;
    readonly commit: string;
  };
  readonly notice: string;
  readonly prefilter: readonly SecretPattern[];
  readonly filter: readonly FilterTerm[];
  readonly rules: readonly SecretRule[];
  readonly unported: readonly { readonly rule: string; readonly part: string }[];
}
