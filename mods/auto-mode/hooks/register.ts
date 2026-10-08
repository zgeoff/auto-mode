import { buildPromptContext } from './build-prompt-context.ts';
import { parseDecision } from './parse-decision.ts';
import type { ModOn, ModOptions, PromptContext } from './types.ts';

// Commands that can create a worktree, a branch, or a PR. Any other call skips
// the record subprocess, so ordinary calls pay nothing for the session scope.
const SCOPE_COMMAND =
  /\bgit\s[^\n]*?\b(?:worktree\s+add|checkout|switch|branch)\b|\bgh\s+pr\s+create\b/u;

// The record may look up a created PR's head branch with gh, which the CLI
// bounds at 5 seconds.
const RECORD_TIMEOUT_MS = 8000;

export function register(on: ModOn, options: ModOptions): void {
  let sessionID: string | null = null;

  const activeCalls = new Map<string, string | null>();
  const delegatedTasks = new Map<string, string>();

  let prompts: PromptContext = buildPromptContext(null, { source: 'reload' });

  on('classic.SessionStart', (_api, e, next) => {
    if (e.agent_id === undefined) {
      const isCompact = e.source === 'compact' && sessionID === e.session_id;

      sessionID = e.session_id;

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
      sessionID = e.session_id;
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

  on('tool.call', async ($, e, next) => {
    if (e.tool_use_id === undefined) {
      return next(e);
    }

    activeCalls.set(e.tool_use_id, e.agentId ?? null);

    const command =
      e.tool === 'Bash' && typeof e.command === 'string' && SCOPE_COMMAND.test(e.command)
        ? e.command
        : null;

    const isRecorded = command !== null && sessionID !== null;
    const startedAt = isRecorded ? await $.clock.now() : null;
    const cwd = isRecorded ? await $.session.cwd() : null;
    let result;

    try {
      result = await next(e);
    } finally {
      activeCalls.delete(e.tool_use_id);
    }

    if (
      command !== null &&
      cwd !== null &&
      sessionID !== null &&
      startedAt !== null &&
      result.deny === undefined
    ) {
      const executable = typeof options.command === 'string' ? options.command : 'auto-mode';
      const request = { sessionID, cwd, startedAt, command, resultText: result.text ?? '' };

      try {
        await $.process.run([executable, 'record'], {
          timeoutMs: RECORD_TIMEOUT_MS,
          stdin: JSON.stringify(request),
        });
      } catch {
        $.ui.log('auto-mode: session scope not recorded; subprocess failure', { to: 'debug' });
      }
    }

    return result;
  });

  on('tool.check', async ($, e, next) => {
    const decided = await next(e);

    const actionID =
      e.tool_use_id !== undefined && /^call_[\da-f]{24,32}$/u.test(e.tool_use_id)
        ? e.tool_use_id
        : 'unavailable';

    const logPrefix = `auto-mode action ${actionID}:`;

    if (decided.decision !== 'ask') {
      return decided;
    }

    if (next.signal.aborted || sessionID === null) {
      const status = next.signal.aborted ? 'cancelled' : 'missing session context';

      $.ui.log(`${logPrefix} evaluation skipped; ${status}`, { to: 'debug' });

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
        $.ui.log(`${logPrefix} evaluation skipped; untracked tool call`, { to: 'debug' });

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

      const deadlineAt = (await $.clock.now()) + childTimeoutMs - 500;

      $.ui.log(`${logPrefix} evaluator invoked`, { to: 'debug' });

      const request = {
        sessionID,
        ...(e.tool_use_id === undefined ? {} : { toolUseID: e.tool_use_id }),
        cwd,
        toolName: e.tool,
        toolInput: e.input,
        context: {
          agentID: agentID ?? null,
          originalUserTask: prompts.originalUserTask,
          delegatedTask,
          lastDirectUserMessage: isChild ? null : prompts.lastDirectUserMessage,
          omittedTaskContext,
        },
      };

      const result = await $.process.run(
        [command, 'run', '--jev-only', '--evaluation-deadline', String(deadlineAt)],
        { timeoutMs: childTimeoutMs, stdin: JSON.stringify(request) },
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
