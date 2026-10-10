import { JEV_STAGE } from './build-jev-stage.ts';
import { JUDGE_STAGE } from './build-judge-stage.ts';
import type { RecordedStage } from './load-recorded-cases.ts';

const VARIANTS = ['baseline', 'guidance'] as const;
const JUDGES = ['glm', 'spark', 'claude-code'] as const;

// GEO-78 recorded each Jev variant once and each judge once over the asks
// either variant made eligible, so a recording pairs one variant with one judge.
export function buildSecondJudgeRecordings(): Record<string, readonly RecordedStage[]> {
  return Object.fromEntries(
    VARIANTS.flatMap((variant) =>
      JUDGES.map((judge) => [
        `${variant}-${judge}`,
        (['second-judge', 'answer-guidance'] as const).flatMap((corpus) => [
          {
            corpus,
            stage: JEV_STAGE,
            source: {
              kind: 'jev-report' as const,
              root: 'corpora' as const,
              path: `recorded/second-judge/jev-${variant}.json`,
            },
          },
          {
            corpus,
            stage: JUDGE_STAGE,
            source: {
              kind: 'judge-report' as const,
              root: 'results' as const,
              path: `legacy/second-judge/judge-${judge}.json`,
            },
          },
        ]),
      ]),
    ),
  );
}
