import { parseDecision } from './parse-decision.ts';
import type { ModOn, ModOptions } from './types.ts';

export function register(on: ModOn, options: ModOptions): void {
  let context: {
    readonly sessionID: string;
    readonly transcriptPath: string;
  } | null = null;

  const subagentCalls = new Set<string>();

  on('classic.SessionStart', (_api, e, next) => {
    if (e.agent_id === undefined) {
      context = { sessionID: e.session_id, transcriptPath: e.transcript_path };
    }

    return next(e);
  });

  on('classic.UserPromptSubmit', (_api, e, next) => {
    if (e.agent_id === undefined) {
      context = { sessionID: e.session_id, transcriptPath: e.transcript_path };
    }

    return next(e);
  });

  on('tool.call', async (_api, e, next) => {
    if (e.agentId === undefined || e.tool_use_id === undefined) {
      return next(e);
    }

    subagentCalls.add(e.tool_use_id);

    try {
      return await next(e);
    } finally {
      subagentCalls.delete(e.tool_use_id);
    }
  });

  on('tool.check', async ($, e, next) => {
    const decided = await next(e);

    if (
      decided.decision !== 'ask' ||
      next.signal.aborted ||
      context === null ||
      (e.tool_use_id !== undefined && subagentCalls.has(e.tool_use_id))
    ) {
      return decided;
    }

    const timeoutMs = Math.min(8000, next.budget.remainingMs - 250);

    if (timeoutMs < 500) {
      return decided;
    }

    try {
      const cwd = await $.session.cwd();

      const command = typeof options.command === 'string' ? options.command : 'auto-mode';
      const childTimeoutMs = Math.min(timeoutMs, next.budget.remainingMs - 250);

      if (childTimeoutMs < 500) {
        return decided;
      }

      const deadlineAt = Date.now() + childTimeoutMs - 500;

      const result = await $.process.run(
        [command, 'run', '--jev-only', '--evaluation-deadline', String(deadlineAt)],
        {
          timeoutMs: childTimeoutMs,
          stdin: JSON.stringify({
            hook_event_name: 'PermissionRequest',
            prompt_id: e.tool_use_id ?? 'mod-check',
            session_id: context.sessionID,
            cwd,
            transcript_path: context.transcriptPath,
            tool_name: e.tool,
            tool_input: e.input,
          }),
        },
      );

      if (result.exitCode !== 0 || result.isStdoutTruncated || next.signal.aborted) {
        return decided;
      }

      return parseDecision(result.stdout) ?? decided;
    } catch {
      return decided;
    }
  });
}
