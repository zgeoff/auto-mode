import { JEV_STAGE } from './build-jev-stage.ts';
import type { RecordedStage } from './load-recorded-cases.ts';

const VARIANTS = ['baseline', 'guidance'] as const;

export function buildSecondJudgeJevRecordings(): Record<string, readonly RecordedStage[]> {
  return Object.fromEntries(
    VARIANTS.map((variant) => [
      `${variant}-jev`,
      (['second-judge', 'answer-guidance'] as const).map((corpus) => ({
        corpus,
        stage: JEV_STAGE,
        source: {
          kind: 'jev-report' as const,
          root: 'corpora' as const,
          path: `recorded/second-judge/jev-${variant}.json`,
        },
      })),
    ]),
  );
}
