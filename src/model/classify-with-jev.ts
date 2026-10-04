import type { Config } from '../config/config.ts';
import { resolveApiKey } from '../config/config.ts';
import { loadClaudeRules } from '../config/load-claude-rules.ts';
import type { HookPayload } from '../harness/types.ts';
import { loadPolicy } from '../policy/load-policy.ts';
import { readLastUserMessage } from '../transcript/read-last-user-message.ts';
import { buildDecisionRequest } from './build-decision-request.ts';
import type { ModelOutcome } from './classify-with-model.ts';
import { formatClassifierNote } from './format-classifier-note.ts';
import { pickDecisionVerdict } from './pick-decision-verdict.ts';
import { sendDecision } from './send-decision.ts';

export async function classifyWithJev(payload: HookPayload, config: Config): Promise<ModelOutcome> {
  const start = performance.now();
  let key: string | null = null;

  try {
    key = await resolveApiKey(config.provider);

    if (key === null) {
      throw new Error('no API key: set the configured environment variable or key command');
    }

    const [policy, rules, lastUserMessage] = await Promise.all([
      loadPolicy(
        { classifierPath: config.classifierPath, rulesPath: config.rulesPath },
        'decision.md',
      ),
      loadClaudeRules(config.claudeSettingsPath),
      readLastUserMessage(payload.transcriptPath),
    ]);

    const request = buildDecisionRequest(payload, policy, rules, lastUserMessage);

    const result = await sendDecision(config.provider, key, request);

    const verdict = pickDecisionVerdict(request, result, config.minConfidence ?? 0.8);

    return {
      verdict,
      note: formatClassifierNote(
        `${config.provider.model}: ${verdict.kind} (${Math.round(performance.now() - start)}ms, ${result.inputTokens} input tokens)`,
        key,
      ),
    };
  } catch (error) {
    let reason = 'classifier failed';

    if (error instanceof Error) {
      reason =
        error.name === 'AbortError'
          ? `timed out after ${config.provider.timeoutMs}ms`
          : error.message;
    }

    const note = formatClassifierNote(`${config.provider.model} unavailable: ${reason}`, key);

    return {
      verdict:
        config.onFailure === 'deny'
          ? { kind: 'deny', rule: 'Classifier Unavailable', reason: note }
          : null,
      note,
      unavailable: true,
    };
  }
}
