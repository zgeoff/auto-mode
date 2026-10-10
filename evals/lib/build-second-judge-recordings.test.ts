import { expect, test } from 'bun:test';
import { buildSecondJudgeRecordings } from './build-second-judge-recordings.ts';

test('it pairs each Jev variant with each judge', () => {
  expect(Object.keys(buildSecondJudgeRecordings())).toStrictEqual([
    'baseline-glm',
    'baseline-spark',
    'baseline-claude-code',
    'guidance-glm',
    'guidance-spark',
    'guidance-claude-code',
  ]);
});

test('it reads the variant Jev answers from the corpora and the judge answers from the results clone, for both corpora', () => {
  expect(buildSecondJudgeRecordings()['guidance-spark']).toStrictEqual([
    {
      corpus: 'second-judge',
      stage: 'jev',
      source: {
        kind: 'jev-report',
        root: 'corpora',
        path: 'recorded/second-judge/jev-guidance.json',
      },
    },
    {
      corpus: 'second-judge',
      stage: 'judge',
      source: {
        kind: 'judge-report',
        root: 'results',
        path: 'legacy/second-judge/judge-spark.json',
      },
    },
    {
      corpus: 'answer-guidance',
      stage: 'jev',
      source: {
        kind: 'jev-report',
        root: 'corpora',
        path: 'recorded/second-judge/jev-guidance.json',
      },
    },
    {
      corpus: 'answer-guidance',
      stage: 'judge',
      source: {
        kind: 'judge-report',
        root: 'results',
        path: 'legacy/second-judge/judge-spark.json',
      },
    },
  ]);
});
