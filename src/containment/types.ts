type ScopeGrant =
  | { readonly kind: 'path' | 'branch' }
  | { readonly kind: 'pull-request'; readonly number: number };

export interface ScopeFinding {
  readonly kind: 'path' | 'branch' | 'remote-write' | 'credential' | 'prune' | 'discard';
  readonly target: string;
  readonly grant?: ScopeGrant;
}
