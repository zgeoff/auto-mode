import type { ModScopeRecord } from '../contract/types.ts';
import { buildActionRequest } from './build-action-request.ts';
import { buildPromptContext } from './build-prompt-context.ts';
import { isScopeCommand } from './is-scope-command.ts';
import { isToolInput } from './is-tool-input.ts';
import { parseDecision } from './parse-decision.ts';
import type { ModOn, ModOptions, PromptContext } from './types.ts';

// The record may look up a created PR's head branch with gh, which the CLI
// bounds at 5 seconds.
const RECORD_TIMEOUT_MS = 8000;

// Claude Code's own limit for one subprocess. The hook's budget stands still
// while the subprocess runs, and the CLI bounds Jev and the judge by its config.
const EVALUATION_TIMEOUT_MS = 600_000;

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
      e.tool === 'Bash' && typeof e.command === 'string' && isScopeCommand(e.command)
        ? e.command
        : null;

    const startedAt = Date.now();
    const cwd = command === null || sessionID === null ? null : await $.session.cwd();
    let result;

    try {
      result = await next(e);
    } finally {
      activeCalls.delete(e.tool_use_id);
    }

    if (command !== null && cwd !== null && sessionID !== null && result.deny === undefined) {
      const executable = typeof options.command === 'string' ? options.command : 'auto-mode';

      const request: ModScopeRecord = {
        sessionID,
        cwd,
        startedAt,
        command,
        resultText: result.text ?? '',
      };

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

    if (next.budget.remainingMs < 750) {
      $.ui.log(`${logPrefix} evaluation skipped; insufficient budget`, { to: 'debug' });

      return decided;
    }

    try {
      const cwd = await $.session.cwd();

      const agentID = e.tool_use_id === undefined ? null : activeCalls.get(e.tool_use_id);

      if (agentID === undefined) {
        $.ui.log(`${logPrefix} evaluation skipped; untracked tool call`, { to: 'debug' });

        return decided;
      }

      if (!isToolInput(e.input)) {
        $.ui.log(`${logPrefix} evaluation skipped; tool input is not an object`, { to: 'debug' });

        return decided;
      }

      const command = typeof options.command === 'string' ? options.command : 'auto-mode';
      const childTimeoutMs = EVALUATION_TIMEOUT_MS;
      const deadlineAt = Date.now() + childTimeoutMs - 500;

      $.ui.log(`${logPrefix} evaluator invoked`, { to: 'debug' });

      const request = buildActionRequest({
        sessionID,
        toolUseID: e.tool_use_id,
        cwd,
        toolName: e.tool,
        toolInput: e.input,
        agentID,
        delegatedText: agentID === null ? undefined : delegatedTasks.get(agentID),
        prompts,
      });

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
