import { expect, test } from 'bun:test';
import { buildFallbackCounts } from './build-fallback-counts.ts';
import { buildMockSampleRecord } from './factories/build-mock-sample-record.ts';

test('it counts the answers of each stage that another model than its own wrote, by model', () => {
  expect(
    buildFallbackCounts(
      [
        buildMockSampleRecord({ stage: 'judge', model: 'claude-sonnet-5-5' }),
        buildMockSampleRecord({ stage: 'judge', model: 'claude-sonnet-5' }),
        buildMockSampleRecord({ stage: 'judge', model: 'claude-sonnet-5' }),
        buildMockSampleRecord({ stage: 'judge', model: 'claude-opus-5' }),
        buildMockSampleRecord({ stage: 'jev', model: 'jev-1' }),
      ],
      { jev: 'jev-1', judge: 'claude-sonnet-5-5' },
    ),
  ).toStrictEqual([
    { stage: 'jev', model: 'jev-1', answered: 1, fallbacks: 0, models: {} },
    {
      stage: 'judge',
      model: 'claude-sonnet-5-5',
      answered: 4,
      fallbacks: 3,
      models: { 'claude-sonnet-5': 2, 'claude-opus-5': 1 },
    },
  ]);
});

test('it leaves out the records that hold no answering model', () => {
  expect(
    buildFallbackCounts(
      [
        buildMockSampleRecord({ stage: 'judge' }),
        buildMockSampleRecord({ stage: 'judge', model: null }),
        buildMockSampleRecord({ stage: 'judge', model: 'claude-sonnet-5' }),
      ],
      { judge: 'claude-sonnet-5-5' },
    ),
  ).toStrictEqual([
    {
      stage: 'judge',
      model: 'claude-sonnet-5-5',
      answered: 1,
      fallbacks: 1,
      models: { 'claude-sonnet-5': 1 },
    },
  ]);
});

test('it reports no stage whose samples hold no answering model', () => {
  expect(
    buildFallbackCounts([buildMockSampleRecord({ stage: 'judge', model: null })], {
      judge: 'claude-sonnet-5-5',
    }),
  ).toStrictEqual([]);
});

test('it leaves out a reply to a request that named another model than the stage’s', () => {
  expect(
    buildFallbackCounts(
      [
        buildMockSampleRecord({ stage: 'judge', model: 'claude-sonnet-5-5' }),
        buildMockSampleRecord({
          stage: 'judge',
          status: 'not-scorable',
          verdict: null,
          reason: 'model-changed',
          model: 'claude-opus-5-5',
        }),
      ],
      { judge: 'claude-sonnet-5-5' },
    ),
  ).toStrictEqual([
    { stage: 'judge', model: 'claude-sonnet-5-5', answered: 1, fallbacks: 0, models: {} },
  ]);
});
