import type { ClaudeRules } from '../config/load-claude-rules.ts';
import { buildDecisionRequest } from '../model/build-decision-request.ts';
import type { DecisionRequest } from '../model/types.ts';
import { buildEvaluationPayload } from './build-evaluation-payload.ts';
import type { EvaluationCase } from './load-second-judge-corpus.ts';

export function buildEvaluationRequest(
  entry: EvaluationCase,
  policy: string,
  configuredRules: ClaudeRules,
  guidance: Readonly<Record<string, string>> | null,
): DecisionRequest {
  const request = buildDecisionRequest(
    buildEvaluationPayload(entry),
    policy,
    configuredRules,
    entry.lastUserMessage,
    'shipped',
    entry.repositoryContext,
  );

  if (guidance === null) {
    return request;
  }

  const questions = Object.fromEntries(
    Object.entries(request.questions).map(([id, question]) => {
      const rule = request.rules[id];
      const extra = rule?.source === 'shipped' ? guidance[rule.name] : undefined;

      return [
        id,
        extra === undefined
          ? question
          : { ...question, instructions: `${question.instructions}\n${extra}` },
      ];
    }),
  );

  return { ...request, questions };
}
