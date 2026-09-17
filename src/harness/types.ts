/** A harness is the program that runs the agent and calls this hook. */
export type Harness = 'claude' | 'codex' | 'muse';

/** The hook events auto-mode acts on. Others are read and ignored. */
export type HookEvent = 'PreToolUse' | 'PermissionRequest';

/** One tool call, normalised across harnesses. */
export interface HookPayload {
  readonly harness: Harness;
  readonly event: HookEvent;
  readonly sessionId: string;
  readonly cwd: string;
  readonly toolName: string;
  readonly toolInput: Readonly<Record<string, unknown>>;
  /** Where the harness keeps the conversation, when it says. */
  readonly transcriptPath?: string;
  /** The payload as it arrived, for anything this shape drops. */
  readonly raw: Readonly<Record<string, unknown>>;
}

/**
 * What auto-mode decides. `ask` hands the call back to the operator, which is
 * what the harness would have done without this hook.
 */
export type Verdict =
  | { readonly kind: 'allow' }
  | { readonly kind: 'ask' }
  | { readonly kind: 'deny'; readonly rule: string; readonly reason: string };
