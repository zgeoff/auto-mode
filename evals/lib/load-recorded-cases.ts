import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildRecordedSet } from './build-recorded-set.ts';
import type { CaseSet, CaseSource, LoadedCases, RecordedInput } from './define-experiment.ts';
import type { MeasurementCase, MeasurementCorpus } from './load-measurement-sets.ts';
import { loadMeasurementSets } from './load-measurement-sets.ts';
import type { RecordedSource } from './load-recorded-answers.ts';
import { loadRecordedAnswers } from './load-recorded-answers.ts';

export interface RecordedStage {
  readonly corpus: MeasurementCorpus;
  readonly stage: string;
  readonly source: RecordedSource;
}

export interface MeasurementCaseOptions {
  readonly corpora: readonly MeasurementCorpus[];
  readonly withHeldOut: boolean;
  readonly recordings: Readonly<Record<string, readonly RecordedStage[]>>;
}

// Loads the measurement sets and, for a recorded run, gives each case the
// answers its recording holds. A recording file that sits in the results clone
// and cannot be read leaves its stage not measured for that corpus.
export async function loadRecordedCases(
  source: Readonly<CaseSource>,
  options: Readonly<MeasurementCaseOptions>,
): Promise<LoadedCases<MeasurementCase>> {
  const loaded = await loadMeasurementSets(
    source.corporaDir,
    source.resultsDir,
    options.corpora,
    options.withHeldOut,
  );

  const stages = source.recording === null ? [] : (options.recordings[source.recording] ?? []);

  const inputs = new Map<string, RecordedInput>();

  let sets: readonly CaseSet<MeasurementCase>[] = loaded.sets;

  for (const planned of stages) {
    const root = planned.source.root === 'corpora' ? source.corporaDir : source.resultsDir;
    const isReadable = root !== null && existsSync(join(root, planned.source.path));

    const answers = isReadable
      ? await loadRecordedAnswers(planned.source, {
          corporaDir: source.corporaDir,
          resultsDir: source.resultsDir,
        })
      : null;

    if (answers === null) {
      const place = planned.source.root === 'corpora' ? 'the corpora' : 'the results clone';

      loaded.notMeasured.push(
        `stage ${planned.stage} on ${planned.corpus}: ${place} holds no recording ${planned.source.path}`,
      );

      continue;
    }

    inputs.set(answers.input.path, answers.input);

    sets = sets.map((set) =>
      set.corpus === planned.corpus ? buildRecordedSet(set, planned.stage, answers) : set,
    );
  }

  return { sets, inputs: [...inputs.values()], notMeasured: loaded.notMeasured };
}
