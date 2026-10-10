import type { ProviderConfig } from '../config/config.ts';
import { resolveApiKey } from '../config/config.ts';
import { toTimerDelay } from '../config/to-timer-delay.ts';
import type { EvaluationOptions, HostEnvironment } from '../config/types.ts';
import type { DeniedRule } from '../model/find-denied-rule.ts';
import type { RepositoryContext } from '../model/types.ts';
import { loadPolicy } from '../policy/load-policy.ts';
import type { ActionRequest } from '../request/types.ts';
import { buildJudgeMessage } from './build-judge-message.ts';
import type { JudgedVerdict } from './build-judged-verdict.ts';
import { buildJudgedVerdict } from './build-judged-verdict.ts';
import { parseJudgeReply } from './parse-judge-reply.ts';
import { sendJudgeMessage } from './send-judge-message.ts';
import type { JudgeDiagnostics, JudgeFailure } from './types.ts';

export interface JudgeOutcome extends JudgedVerdict {
  readonly diagnostics: JudgeDiagnostics;
}

export interface JudgeEvidence extends DeniedRule {
  readonly repositoryContext: RepositoryContext | null;
}

export interface JudgeOptions extends EvaluationOptions {
  readonly host: Readonly<HostEnvironment>;
  readonly rulesPath?: string | undefined;
}

// The judge fails closed: no key, no policy, a timeout, a failed call or an
// unreadable reply all keep the deny with its template reason.
export async function classifyWithJudge(
  payload: ActionRequest,
  evidence: Readonly<JudgeEvidence>,
  judge: Readonly<ProviderConfig>,
  options: Readonly<JudgeOptions>,
): Promise<JudgeOutcome> {
  const start = performance.now();
  const now = options.now ?? Date.now;
  let failure: JudgeFailure | null = null;
  let verdict: JudgedVerdict;

  try {
    failure = 'credential';

    const apiKey = judge.protocol === 'claude-code' ? null : await resolveApiKey(judge, options);

    if (judge.protocol !== 'claude-code' && apiKey === null) {
      throw new Error('no API key for the judge');
    }

    failure = 'policy';

    const system = await loadPolicy({ rulesPath: options.rulesPath }, 'judge.md');

    const directMessage =
      payload.decisionContext?.agentID === null
        ? (payload.decisionContext.lastDirectUserMessage?.text ?? null)
        : null;

    const user = buildJudgeMessage({
      rule: evidence.rule,
      basis: evidence.basis,
      action: { tool: payload.toolName, cwd: payload.cwd, input: payload.toolInput },
      lastUserMessage: directMessage,
      repositoryContext: evidence.repositoryContext,
    });

    const remainingMs =
      options.deadlineAt === undefined ? judge.timeoutMs : options.deadlineAt - now();

    failure = 'timeout';

    if (remainingMs <= 0 || options.signal?.aborted === true) {
      throw new DOMException('Judge deadline expired', 'AbortError');
    }

    const timeout = options.timeout ?? ((ms: number) => AbortSignal.timeout(ms));
    const timer = timeout(toTimerDelay(Math.min(judge.timeoutMs, remainingMs)));
    const signal = options.signal === undefined ? timer : AbortSignal.any([timer, options.signal]);

    failure = 'request';

    const text = await sendJudgeMessage(
      judge,
      { system, user },
      { apiKey, env: options.host.env },
      signal,
    ).catch((error: unknown) => {
      if (signal.aborted) {
        failure = 'timeout';
      }

      throw error;
    });

    const reply = parseJudgeReply(text);

    failure = reply.kind === 'unreadable' ? 'unreadable' : null;
    verdict = buildJudgedVerdict(evidence.rule, evidence.basis, reply);
  } catch {
    verdict = buildJudgedVerdict(evidence.rule, evidence.basis, null);
  }

  return {
    ...verdict,
    diagnostics: {
      status: verdict.status,
      failureReason: failure,
      model: judge.model,
      rule: evidence.rule.name,
      tier: evidence.rule.tier,
      elapsedMs: Math.round(performance.now() - start),
    },
  };
}
