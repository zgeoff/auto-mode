// What a direct user message must name to hand a finding to the judge: the
// path or branch the target holds, or a pull request by number. A finding
// without one, such as a credential or a push to another remote, stays final.
type ScopeGrant =
  | { readonly kind: 'path' | 'branch' }
  | { readonly kind: 'pull-request'; readonly number: number };

export interface ScopeFinding {
  readonly kind: 'path' | 'branch' | 'remote-write' | 'credential' | 'prune' | 'discard';
  readonly target: string;
  readonly grant?: ScopeGrant;
}
