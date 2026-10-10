import { buildDecisionRequest } from 'auto-mode';
import { classifyJevRecord } from './classify-jev-record.ts';
import type { JevClass } from './classify-live-jev-answers.ts';
import { classifyLiveJevAnswers } from './classify-live-jev-answers.ts';
import type { Stage, StageOutcome } from './define-experiment.ts';
import type { MeasurementCase } from './load-measurement-sets.ts';
import type { JevReading } from './pick-jev-verdict.ts';
import { pickJevVerdict } from './pick-jev-verdict.ts';

export const JEV_STAGE = 'jev';

// Jev in the shipped per-rule shape: one choice question per rule over the
// shipped request. The reading decides whether an all-allow ask allows.
export function buildJevStage(reading: JevReading): Stage<MeasurementCase> {
  return {
    name: JEV_STAGE,
    sends: true,
    run: async (entry, context) => {
      const request = buildDecisionRequest(
        entry.case.action,
        context.policy,
        entry.case.configuredRules ?? context.configuredRules,
        entry.case.lastUserMessage,
        'shipped',
        entry.case.repository,
        entry.case.mcpServers,
      );

      const result = await context.send(request);

      return buildOutcome(classifyLiveJevAnswers(request, result), reading);
    },
    replay: (entry, context) => {
      const recorded = entry.case.recorded[JEV_STAGE]?.[context.sample];

      if (recorded === undefined) {
        return Promise.resolve({
          status: 'skipped',
          reason: `The recording holds no Jev sample ${context.sample}.`,
        });
      }

      if (recorded.kind === 'judge') {
        throw new Error(`The Jev recording of ${entry.key} holds a judge answer.`);
      }

      if (recorded.kind === 'release') {
        if (reading !== 'release-all-allow') {
          throw new Error(`A release recording cannot replay the ${reading} reading.`);
        }

        const answer = { answer: recorded.released, latencyMs: null, model: recorded.model };

        const outcome: StageOutcome = recorded.released
          ? { status: 'scored', verdict: 'allow', pBlock: null, reason: null, recorded: answer }
          : {
              status: 'scored',
              verdict: 'deny',
              pBlock: null,
              reason: 'The recorded answer falls short of release-all-allow.',
              recorded: answer,
            };

        return Promise.resolve(outcome);
      }

      const answer = {
        answer: recorded.record,
        latencyMs: recorded.record.elapsedMs,
        model: recorded.model,
      };

      const jev = classifyJevRecord(recorded.record);

      if (jev === null) {
        return Promise.resolve({
          status: 'not-scorable',
          reason: `decision-${recorded.record.failureReason ?? 'unknown'}`,
          recorded: answer,
        });
      }

      return Promise.resolve({ ...buildOutcome(jev, reading), recorded: answer });
    },
  };
}

function buildOutcome(jev: Readonly<JevClass>, reading: JevReading): StageOutcome {
  const verdict = pickJevVerdict(jev, reading);

  return {
    status: 'scored',
    verdict,
    pBlock: jev.pBlock,
    reason: jev.kind === 'allow' ? null : `${jev.kind}: ${jev.rule}`,
  };
}
