import { findCurrentDirectUserMessage } from '../../mods/auto-mode/contract/find-current-direct-user-message.ts';
import type { ProviderConfig } from '../config/config.ts';
import { resolveApiKey } from '../config/config.ts';
import { toTimerDelay } from '../config/to-timer-delay.ts';
import type { EvaluationOptions, HostEnvironment } from '../config/types.ts';
import { loadPolicy } from '../policy/load-policy.ts';
import type { ActionRequest } from '../request/types.ts';
import type { JudgeEvidence } from '../types.ts';
import { buildJudgeMessage } from './build-judge-message.ts';
import type { JudgedVerdict } from './build-judged-verdict.ts';
import { buildJudgedVerdict } from './build-judged-verdict.ts';
import { parseJudgeReply } from './parse-judge-reply.ts';
import { sendJudgeMessage } from './send-judge-message.ts';
import type {
  JudgeDiagnostics,
  JudgeFailure,
  JudgeMessageReply,
  JudgeOverturns,
  JudgeSession,
} from './types.ts';

export interface JudgeOutcome extends JudgedVerdict {
  readonly diagnostics: JudgeDiagnostics;
}

export interface JudgeOptions extends EvaluationOptions {
  readonly host: Readonly<HostEnvironment>;
  readonly rulesPath?: string | undefined;
  readonly overturns: JudgeOverturns;
  readonly judgeSession?: JudgeSession | undefined;
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

  // The task scope is a fact the judge cannot read better than the check did,
  // so only consent clears a containment finding.
  const overturns = evidence.containment === undefined ? options.overturns : 'consent';
  let failure: JudgeFailure | null = null;
  let answered: JudgeMessageReply | null = null;
  let verdict: JudgedVerdict;

  try {
    failure = 'credential';

    const apiKey = judge.protocol === 'claude-code' ? null : await resolveApiKey(judge, options);

    if (judge.protocol !== 'claude-code' && apiKey === null) {
      throw new Error('no API key for the judge');
    }

    failure = 'policy';

    const system = await loadPolicy({ rulesPath: options.rulesPath }, 'judge.md');

    const directMessage = findCurrentDirectUserMessage(
      payload.decisionContext?.lastDirectUserMessage,
    );

    const user = buildJudgeMessage({
      rule: evidence.rule,
      basis: evidence.basis,
      action: { tool: payload.toolName, cwd: payload.cwd, input: payload.toolInput },
      lastUserMessage: directMessage,
      repositoryContext: evidence.repositoryContext,
      containment: evidence.containment,
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

    answered = await sendJudgeMessage(
      judge,
      { system, user },
      { apiKey, env: options.host.env, session: options.judgeSession },
      signal,
    ).catch((error: unknown) => {
      if (signal.aborted) {
        failure = 'timeout';
      }

      throw error;
    });

    const reply = parseJudgeReply(answered.text);

    failure = reply.kind === 'unreadable' ? 'unreadable' : null;

    verdict = buildJudgedVerdict(
      evidence.rule,
      evidence.basis,
      reply,
      overturns,
      evidence.containment?.reason,
    );
  } catch {
    verdict = buildJudgedVerdict(
      evidence.rule,
      evidence.basis,
      null,
      overturns,
      evidence.containment?.reason,
    );
  }

  return {
    ...verdict,
    diagnostics: {
      status: verdict.status,
      failureReason: failure,
      overturnBasis: verdict.overturnBasis,
      model: judge.model,
      answeringModel: answered?.model ?? null,
      safetyStops: answered?.safetyStops ?? null,
      warm: answered?.warm ?? null,
      rule: evidence.rule.source === 'shipped' ? evidence.rule.name : evidence.rule.source,
      tier: evidence.rule.tier,
      elapsedMs: Math.round(performance.now() - start),
    },
  };
}
