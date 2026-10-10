import { expect, test } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadCaseLabels } from '../lib/load-case-labels.ts';

test('it finds only the labelled corpora beside the recorded answers', async () => {
  const entries = await readdir(resolve(import.meta.dirname, '../corpora'), {
    withFileTypes: true,
  });

  expect(
    entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
  ).toIncludeSameMembers([
    'answer-guidance',
    'applicability',
    'containment',
    'decision-rules',
    'question-severity',
    'recorded',
    'relay-consent',
    'second-judge',
    'stale-consent',
    'task-scope',
  ]);
});

test.each([
  ['answer-guidance', 12],
  ['applicability', 11],
  ['containment', 13],
  ['decision-rules', 284],
  ['question-severity', 56],
  ['relay-consent', 76],
  ['second-judge', 83],
  ['stale-consent', 12],
  ['task-scope', 4],
])('it labels exactly the cases of the %s corpus', async (corpus, count) => {
  const labels = await loadCaseLabels(`evals/corpora/${corpus}`);

  expect(Object.keys(labels.cases)).toHaveLength(count);
});
