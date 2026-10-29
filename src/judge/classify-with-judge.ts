import { findCurrentDirectUserMessage } from '../../mods/auto-mode/contract/find-current-direct-user-message.ts';
import type { ProviderConfig } from '../config/config.ts';
import { resolveApiKey } from '../config/config.ts';
import { createDeadlineSignal } from '../config/create-deadline-signal.ts';
import { pickJudgeLane } from '../config/pick-judge-lane.ts';
import type { EvaluationOptions } from '../config/types.ts';
import { loadPolicy } from '../policy/load-policy.ts';
import type { ActionRequest } from '../request/types.ts';
import type { JudgeEvidence } from '../types.ts';
import { buildJudgeMessage } from './build-judge-message.ts';
import type { JudgedVerdict } from './build-judged-verdict.ts';
import { buildJudgedVerdict } from './build-judged-verdict.ts';
import { parseJudgeReplies } from './parse-judge-replies.ts';
import { sendJudgeMessage } from './send-judge-message.ts';
import type {
  JudgeDiagnostics,
  JudgeFailure,
  JudgeMessageReply,
  JudgeOverturns,
  JudgeReply,
  JudgeSession,
} from './types.ts';

export interface JudgeOutcome extends JudgedVerdict {
  readonly diagnostics: JudgeDiagnostics;
}

export interface JudgeOptions extends EvaluationOptions {
  readonly rulesPath?: string | undefined;
  readonly overturns: JudgeOverturns;
  readonly judgeSession?: JudgeSession | undefined;
}

export async function classifyWithJudge(
  payload: ActionRequest,
  evidence: readonly JudgeEvidence[],
  judge: Readonly<ProviderConfig>,
  options: Readonly<JudgeOptions>,
): Promise<readonly JudgeOutcome[]> {
  const start = performance.now();
  const runtime = options.runtime;
  let failure: JudgeFailure | null = null;
  let answered: JudgeMessageReply | null = null;
  let replies: readonly (JudgeReply | null)[] = evidence.map(() => null);

  const directMessage = findCurrentDirectUserMessage(
    payload.decisionContext?.lastDirectUserMessage,
  );

  try {
    failure = 'credential';

    const needsKey = pickJudgeLane(judge).credential === 'api-key';
    const apiKey = needsKey ? await resolveApiKey(judge, options) : null;

    if (needsKey && apiKey === null) {
      throw new Error('no API key for the judge');
    }

    failure = 'policy';

    const system = await loadPolicy({ rulesPath: options.rulesPath }, 'judge.md');

    const user = buildJudgeMessage({
      denies: evidence.map((entry) => ({
        rule: entry.rule,
        basis: entry.basis,
        containment: entry.containment,
        misreadClears: entry.misreadClears,
      })),
      action: { tool: payload.toolName, cwd: payload.cwd, input: payload.toolInput },
      lastUserMessage: directMessage,
      repositoryContext:
        evidence.find((entry) => entry.repositoryContext !== null)?.repositoryContext ?? null,
    });

    failure = 'timeout';

    const signal = createDeadlineSignal(judge.timeoutMs, options);

    if (signal === null) {
      throw new DOMException('Judge deadline expired', 'AbortError');
    }

    failure = 'request';

    answered = await sendJudgeMessage(
      judge,
      { system, user },
      { apiKey, env: runtime.host.env, session: options.judgeSession },
      signal,
    ).catch((error: unknown) => {
      if (signal.aborted) {
        failure = 'timeout';
      }

      throw error;
    });

    replies = parseJudgeReplies(
      answered.text,
      evidence.map((entry) => entry.rule.name),
    );

    failure = null;
  } catch {}

  const elapsedMs = Math.round(performance.now() - start);

  return evidence.map((entry, index) => {
    const reply = replies[index] ?? null;
    const overturns = entry.containment === undefined ? options.overturns : 'consent';

    const verdict = buildJudgedVerdict(entry.rule, entry.basis, reply, {
      overturns,
      heldReason: entry.containment?.reason,
      misreadClears: entry.misreadClears,
      hasUserMessage: directMessage !== null,
    });

    return {
      ...verdict,
      diagnostics: {
        status: verdict.status,
        failureReason: failure ?? (reply?.kind === 'unreadable' ? 'unreadable' : null),
        overturnBasis: verdict.overturnBasis,
        overturnReason: verdict.overturnReason,
        model: judge.model,
        answeringModel: answered?.model ?? null,
        safetyStops: answered?.safetyStops ?? null,
        warm: answered?.warm ?? null,
        rule: entry.rule.source === 'shipped' ? entry.rule.name : entry.rule.source,
        tier: entry.rule.tier,
        elapsedMs,
      },
    };
  });
}
