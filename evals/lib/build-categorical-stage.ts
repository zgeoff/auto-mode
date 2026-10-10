import { buildDecisionRequest } from 'auto-mode';
import { buildCategoricalQuestions } from './build-categorical-questions.ts';
import type { Stage } from './define-experiment.ts';
import type { MeasurementCase } from './load-measurement-sets.ts';
import { pickCategoricalVerdict } from './pick-categorical-verdict.ts';

// Jev in the one-question categorical shape over the shipped request state. A
// confident none allows; every other answer is a deny, as an ask is in the
// decision model. No recording holds its answers, so it only runs live.
export const CATEGORICAL_STAGE = 'jev-categorical';

export function buildCategoricalStage(): Stage<MeasurementCase> {
  return {
    name: CATEGORICAL_STAGE,
    sends: true,
    run: async (entry, context) => {
      const baseline = buildDecisionRequest(
        entry.case.action,
        context.policy,
        entry.case.configuredRules ?? context.configuredRules,
        entry.case.lastUserMessage,
        'shipped',
        entry.case.repository,
        entry.case.mcpServers,
      );

      const questions = buildCategoricalQuestions(baseline);
      const [choice, ...choices] = Object.keys(questions['categorical']?.criteria ?? {});

      if (choice === undefined) {
        throw new Error('The categorical question offers no option.');
      }

      const result = await context.sendWithChoices({ ...baseline, questions }, [
        choice,
        ...choices,
      ]);

      const answer = result.answers['categorical'];
      const verdict = pickCategoricalVerdict(baseline.rules, answer);
      const pBlock = answer === undefined ? null : 1 - (answer.probabilities['none'] ?? 0);

      return verdict.kind === 'allow'
        ? { status: 'scored', verdict: 'allow', pBlock, reason: null }
        : {
            status: 'scored',
            verdict: 'deny',
            pBlock,
            reason: verdict.rule ?? `categorical ${verdict.kind}`,
          };
    },
  };
}
