export type Harness = 'claude' | 'codex' | 'muse';

export type HookEvent = 'PreToolUse' | 'PermissionRequest';

export interface HookPayload {
  readonly harness: Harness;
  readonly event: HookEvent;
  readonly sessionId: string;
  readonly cwd: string;
  readonly toolName: string;
  readonly toolInput: Readonly<Record<string, unknown>>;
  readonly transcriptPath?: string | undefined;
  readonly raw: Readonly<Record<string, unknown>>;
}

export type Verdict =
  | { readonly kind: 'allow' }
  | { readonly kind: 'ask' }
  | { readonly kind: 'deny'; readonly rule: string; readonly reason: string };
