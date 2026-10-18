import { CLI_LIMITS } from '../contract/cli-limits.ts';
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

export function register(on: ModOn, options: ModOptions): void {
  let sessionID: string | null = null;

  const activeCalls = new Map<string, string | null>();
  const delegatedTasks = new Map<string, string>();

  let prompts: PromptContext = buildPromptContext(null, { source: 'reload' });

  on('classic.SessionStart', (_api, event, next) => {
    if (event.agent_id === undefined) {
      const isCompact = event.source === 'compact' && sessionID === event.session_id;

      sessionID = event.session_id;

      const previousPrompts = isCompact ? prompts : null;

      prompts = buildPromptContext(previousPrompts, { source: event.source ?? 'unknown' });

      if (!isCompact) {
        delegatedTasks.clear();
      }
    }

    return next(event);
  });

  on('classic.UserPromptSubmit', (_api, event, next) => {
    if (event.agent_id === undefined) {
      sessionID = event.session_id;
    }

    return next(event);
  });

  on('prompt.submit', (_api, event, next) => {
    prompts = buildPromptContext(prompts, event);

    return next(event);
  });

  on('agent.spawn', async (_api, event, next) => {
    const result = await next(event);

    if (result.agentId !== undefined && !delegatedTasks.has(result.agentId)) {
      delegatedTasks.set(result.agentId, event.prompt);
    }

    return result;
  });

  on('tool.call', async ($, event, next) => {
    if (event.tool_use_id === undefined) {
      return next(event);
    }

    activeCalls.set(event.tool_use_id, event.agentId ?? null);

    const command =
      event.tool === 'Bash' && typeof event.command === 'string' && isScopeCommand(event.command)
        ? event.command
        : null;

    const startedAt = Date.now();
    const cwd = command === null || sessionID === null ? null : await $.session.cwd();
    let result;

    try {
      result = await next(event);
    } finally {
      activeCalls.delete(event.tool_use_id);
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

  on('tool.check', async ($, event, next) => {
    const decided = await next(event);

    const actionID =
      event.tool_use_id !== undefined && /^call_[\da-f]{24,32}$/u.test(event.tool_use_id)
        ? event.tool_use_id
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

      const agentID = event.tool_use_id === undefined ? null : activeCalls.get(event.tool_use_id);

      if (agentID === undefined) {
        $.ui.log(`${logPrefix} evaluation skipped; untracked tool call`, { to: 'debug' });

        return decided;
      }

      if (!isToolInput(event.input)) {
        $.ui.log(`${logPrefix} evaluation skipped; tool input is not an object`, { to: 'debug' });

        return decided;
      }

      const command = typeof options.command === 'string' ? options.command : 'auto-mode';
      const childTimeoutMs = CLI_LIMITS.evaluationMs;
      const deadlineAt = Date.now() + childTimeoutMs - 500;

      $.ui.log(`${logPrefix} evaluator invoked`, { to: 'debug' });

      const request = buildActionRequest({
        sessionID,
        toolUseID: event.tool_use_id,
        cwd,
        toolName: event.tool,
        toolInput: event.input,
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
