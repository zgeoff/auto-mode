import { expect, test } from 'bun:test';
import { buildSecondJudgeJevRecordings } from './build-second-judge-jev-recordings.ts';

test('it holds one recording per Jev variant', () => {
  expect(Object.keys(buildSecondJudgeJevRecordings())).toStrictEqual([
    'baseline-jev',
    'guidance-jev',
  ]);
});

test('it reads only the variant Jev answers from the corpora, for both corpora', () => {
  expect(buildSecondJudgeJevRecordings()['guidance-jev']).toStrictEqual([
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
      corpus: 'answer-guidance',
      stage: 'jev',
      source: {
        kind: 'jev-report',
        root: 'corpora',
        path: 'recorded/second-judge/jev-guidance.json',
      },
    },
  ]);
});
