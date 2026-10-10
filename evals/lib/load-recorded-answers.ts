import { join } from 'node:path';
import * as z from 'zod';
import { replaySamplesSchema } from './corpora/replay-samples-schema.ts';
import type { RecordedInput } from './define-experiment.ts';
import { jevReportSchema } from './jev-report-schema.ts';
import { judgeReportSchema } from './judge-report-schema.ts';
import { loadCorpus } from './load-corpus.ts';
import type { RecordedSample, RecordedSamples } from './load-measurement-sets.ts';

export type RecordedSource =
  | { readonly kind: 'jev-report'; readonly root: 'corpora' | 'results'; readonly path: string }
  | { readonly kind: 'judge-report'; readonly root: 'corpora' | 'results'; readonly path: string }
  | { readonly kind: 'release'; readonly root: 'corpora' | 'results'; readonly path: string };

export interface RecordedAnswers {
  readonly input: RecordedInput;
  readonly answers: Readonly<Record<string, RecordedSamples>>;
}

const releasesSchema = replaySamplesSchema.extend({
  source: z.object({ model: z.string() }),
});

// Reads one recorded report into answers by case ID and zero-based sample. A
// report in the results clone is absent when no clone is named, which the
// caller reports as not measured.
export interface RecordedDirs {
  readonly corporaDir: string;
  readonly resultsDir: string | null;
}

export async function loadRecordedAnswers(
  source: Readonly<RecordedSource>,
  dirs: Readonly<RecordedDirs>,
): Promise<RecordedAnswers | null> {
  const root = source.root === 'corpora' ? dirs.corporaDir : dirs.resultsDir;

  if (root === null) {
    return null;
  }

  const path = join(root, source.path);
  const label = `${source.root}:${source.path}`;

  const answers = new Map<string, Map<number, RecordedSample>>();

  const setAnswer = (id: string, sample: number, answer: RecordedSample): void => {
    const samples = answers.get(id) ?? new Map<number, RecordedSample>();

    if (samples.has(sample)) {
      throw new Error(`${label} records ${id} sample ${sample} twice.`);
    }

    samples.set(sample, answer);
    answers.set(id, samples);
  };

  if (source.kind === 'jev-report') {
    const report = await loadCorpus(path, jevReportSchema);

    for (const record of report.data.records) {
      setAnswer(record.case, record.sample - 1, {
        kind: 'jev-record',
        record,
        model: report.data.model,
      });
    }

    return {
      input: { path: label, hash: report.hash },
      answers: Object.fromEntries(
        [...answers].map(([id, samples]) => [id, Object.fromEntries(samples)]),
      ),
    };
  }

  if (source.kind === 'judge-report') {
    const report = await loadCorpus(path, judgeReportSchema);

    for (const record of report.data.records) {
      setAnswer(record.case, record.sample - 1, {
        kind: 'judge',
        record,
        model: report.data.model,
      });
    }

    return {
      input: { path: label, hash: report.hash },
      answers: Object.fromEntries(
        [...answers].map(([id, samples]) => [id, Object.fromEntries(samples)]),
      ),
    };
  }

  const report = await loadCorpus(path, releasesSchema);

  // A release recording repeats some samples; a repeat that agrees adds nothing.
  for (const [id, sample, released] of report.data.records) {
    const held = answers.get(id)?.get(sample);

    if (held?.kind !== 'release' || held.released !== (released === 1)) {
      setAnswer(id, sample, {
        kind: 'release',
        released: released === 1,
        model: report.data.source.model,
      });
    }
  }

  return {
    input: { path: label, hash: report.hash },
    answers: Object.fromEntries(
      [...answers].map(([id, samples]) => [id, Object.fromEntries(samples)]),
    ),
  };
}
