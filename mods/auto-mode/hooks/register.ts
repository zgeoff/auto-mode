import { buildPromptContext } from './build-prompt-context.ts';
import { parseDecision } from './parse-decision.ts';
import type { ModOn, ModOptions, PromptContext } from './types.ts';

export function register(on: ModOn, options: ModOptions): void {
  let context: {
    readonly sessionID: string;
    readonly transcriptPath: string;
  } | null = null;

  const activeCalls = new Map<string, string | null>();
  const delegatedTasks = new Map<string, string>();

  let prompts: PromptContext = buildPromptContext(null, { source: 'reload' });

  on('classic.SessionStart', (_api, e, next) => {
    if (e.agent_id === undefined) {
      const isCompact = e.source === 'compact' && context?.sessionID === e.session_id;

      context = { sessionID: e.session_id, transcriptPath: e.transcript_path };

      const previousPrompts = isCompact ? prompts : null;

      prompts = buildPromptContext(previousPrompts, { source: e.source ?? 'unknown' });

      if (!isCompact) {
        delegatedTasks.clear();
      }
    }

    return next(e);
  });

  on('classic.UserPromptSubmit', (_api, e, next) => {
    if (e.agent_id === undefined) {
      context = { sessionID: e.session_id, transcriptPath: e.transcript_path };
    }

    return next(e);
  });

  on('prompt.submit', (_api, e, next) => {
    prompts = buildPromptContext(prompts, e);

    return next(e);
  });

  on('agent.spawn', async (_api, e, next) => {
    const result = await next(e);

    if (result.agentId !== undefined && !delegatedTasks.has(result.agentId)) {
      delegatedTasks.set(result.agentId, e.prompt);
    }

    return result;
  });

  on('tool.call', async (_api, e, next) => {
    if (e.tool_use_id === undefined) {
      return next(e);
    }

    activeCalls.set(e.tool_use_id, e.agentId ?? null);

    try {
      return await next(e);
    } finally {
      activeCalls.delete(e.tool_use_id);
    }
  });

  on('tool.check', async ($, e, next) => {
    const decided = await next(e);

    const actionID =
      e.tool_use_id !== undefined && /^call_[\da-f]{24,32}$/u.test(e.tool_use_id)
        ? e.tool_use_id
        : 'unavailable';

    const logPrefix = `auto-mode action ${actionID}:`;

    if (decided.decision !== 'ask' || next.signal.aborted || context === null) {
      return decided;
    }

    const timeoutMs = Math.min(8000, next.budget.remainingMs - 250);

    if (timeoutMs < 500) {
      $.ui.log(`${logPrefix} evaluation skipped; insufficient budget`, { to: 'debug' });

      return decided;
    }

    try {
      const cwd = await $.session.cwd();

      const agentID = e.tool_use_id === undefined ? null : activeCalls.get(e.tool_use_id);

      if (e.tool_use_id !== undefined && agentID === undefined) {
        return decided;
      }

      const isChild = agentID !== null && agentID !== undefined;
      const delegatedText = isChild ? delegatedTasks.get(agentID) : undefined;

      const delegatedTask =
        delegatedText === undefined ? null : { text: delegatedText, origin: 'agent.spawn' };

      const omittedTaskContext = [
        ...(prompts.originalUserTask === null
          ? [{ field: 'originalUserTask', reason: 'unavailable' }]
          : []),
        ...(isChild && delegatedTask === null
          ? [{ field: 'delegatedTask', reason: 'unavailable' }]
          : []),
      ];

      const command = typeof options.command === 'string' ? options.command : 'auto-mode';
      const childTimeoutMs = Math.min(timeoutMs, next.budget.remainingMs - 250);

      if (childTimeoutMs < 500) {
        $.ui.log(`${logPrefix} evaluation skipped; insufficient subprocess budget`, {
          to: 'debug',
        });

        return decided;
      }

      const deadlineAt = Date.now() + childTimeoutMs - 500;

      $.ui.log(`${logPrefix} evaluator invoked`, { to: 'debug' });

      const result = await $.process.run(
        [command, 'run', '--jev-only', '--evaluation-deadline', String(deadlineAt)],
        {
          timeoutMs: childTimeoutMs,
          stdin: JSON.stringify({
            hook_event_name: 'PermissionRequest',
            prompt_id: e.tool_use_id ?? 'mod-check',
            session_id: context.sessionID,
            cwd,
            ...(isChild ? {} : { transcript_path: context.transcriptPath }),
            ...(prompts.hasPrompt || isChild
              ? {
                  auto_mode_context: {
                    agentID: agentID ?? null,
                    originalUserTask: prompts.originalUserTask,
                    delegatedTask,
                    lastDirectUserMessage: isChild ? null : prompts.lastDirectUserMessage,
                    omittedTaskContext,
                  },
                }
              : {}),
            tool_name: e.tool,
            tool_input: e.input,
          }),
        },
      );

      if (result.exitCode !== 0 || result.isStdoutTruncated || next.signal.aborted) {
        let status = 'nonzero exit';

        if (next.signal.aborted) {
          status = 'cancelled';
        } else if (result.isStdoutTruncated) {
          status = 'truncated verdict';
        }

        $.ui.log(`${logPrefix} manual approval retained; ${status}`, { to: 'debug' });

        return decided;
      }

      const verdict = parseDecision(result.stdout);

      const message =
        verdict === null
          ? 'manual approval retained; no usable verdict; inspect action diagnostics'
          : `evaluator verdict ${verdict.decision}`;

      $.ui.log(`${logPrefix} ${message}`, { to: 'debug' });

      return verdict ?? decided;
    } catch (error) {
      const status =
        error instanceof Error && /aborted: still running after \d+ms$/u.test(error.message)
          ? 'subprocess timeout'
          : 'subprocess failure';

      $.ui.log(`${logPrefix} manual approval retained; ${status}`, { to: 'debug' });

      return decided;
    }
  });
}
