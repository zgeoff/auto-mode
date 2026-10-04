export interface PermissionDecision {
  readonly decision: 'allow' | 'ask' | 'deny';
  readonly reason?: string;
  readonly rule?: string;
  readonly hook?: string;
}

export interface SessionContext {
  readonly cwd: string;
  readonly session_id: string;
  readonly transcript_path: string;
  readonly agent_id?: string;
}

export interface ProcessInput {
  readonly argv: readonly string[];
  readonly init?: { readonly stdin?: string; readonly timeoutMs?: number };
}

export interface ProcessResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly isStdoutTruncated: boolean;
  readonly isStderrTruncated: boolean;
}

interface CheckInput {
  readonly tool: string;
  readonly input: unknown;
  readonly tool_use_id?: string;
}

interface CallInput {
  readonly tool: string;
  readonly tool_use_id?: string;
  readonly agentId?: string;
}

export interface UserTask {
  readonly text: string;
  readonly origin: 'composer' | 'bridge' | 'sdk';
}

export interface PromptContext {
  readonly originalUserTask: UserTask | null;
  readonly lastDirectUserMessage: UserTask | null;
  readonly hasPrompt: boolean;
  readonly canCaptureOriginal: boolean;
}

interface PromptInput {
  readonly text: string;
  readonly origin: { readonly kind: string };
}

interface SpawnInput {
  readonly prompt: string;
  readonly cwd?: string;
  readonly parentAgentId?: string;
}

interface ModEvents {
  readonly 'classic.SessionStart': {
    readonly input: SessionContext & { readonly source?: string };
    readonly result: object;
  };
  readonly 'classic.UserPromptSubmit': { readonly input: SessionContext; readonly result: object };
  readonly 'prompt.submit': { readonly input: PromptInput; readonly result: object };
  readonly 'agent.spawn': {
    readonly input: SpawnInput;
    readonly result: { readonly agentId?: string; readonly model?: string; readonly deny?: string };
  };
  readonly 'tool.call': { readonly input: CallInput; readonly result: object };
  readonly 'tool.check': { readonly input: CheckInput; readonly result: PermissionDecision };
  readonly 'process.run': {
    readonly input: ProcessInput;
    readonly result: { readonly value: ProcessResult };
  };
  readonly 'session.cwd': { readonly input: object; readonly result: { readonly value: string } };
}

interface Next<E extends keyof ModEvents> {
  (input: ModEvents[E]['input']): Promise<ModEvents[E]['result']>;
  readonly signal: Pick<AbortSignal, 'aborted'>;
  readonly budget: { readonly remainingMs: number };
}

export interface ModAPI {
  readonly session: { readonly cwd: () => Promise<string> };
  readonly process: {
    readonly run: (argv: readonly string[], init?: ProcessInput['init']) => Promise<ProcessResult>;
  };
  readonly prompt: { readonly submit: (input: Pick<PromptInput, 'text'>) => Promise<object> };
  readonly tool: { readonly check: (input: CheckInput) => Promise<PermissionDecision> };
  readonly classic: {
    readonly SessionStart: (
      input: Partial<SessionContext> & { readonly source: string },
    ) => Promise<object>;
    readonly UserPromptSubmit: (
      input: Partial<SessionContext> & { readonly prompt: string },
    ) => Promise<object>;
  };
}

export type ModOn = <E extends keyof ModEvents>(
  event: E,
  hook: (
    api: ModAPI,
    input: ModEvents[E]['input'],
    next: Next<E>,
  ) => ModEvents[E]['result'] | Promise<ModEvents[E]['result']>,
) => void;

export interface ModOptions {
  readonly command?: unknown;
}
