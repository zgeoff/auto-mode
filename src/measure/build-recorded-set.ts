import type { CaseSet } from './define-experiment.ts';
import type { MeasurementCase } from './load-measurement-sets.ts';
import type { RecordedAnswers } from './load-recorded-answers.ts';

export function buildRecordedSet(
  set: Readonly<CaseSet<MeasurementCase>>,
  stage: string,
  recorded: Readonly<RecordedAnswers>,
): CaseSet<MeasurementCase> {
  const cases = Object.entries(set.cases).map(([key, entry]): [string, MeasurementCase] => {
    const answers = recorded.answers[recorded.keyedBy === 'key' ? key : entry.id];

    return answers === undefined
      ? [key, entry]
      : [key, { ...entry, recorded: { ...entry.recorded, [stage]: answers } }];
  });

  return { corpus: set.corpus, directory: set.directory, cases: Object.fromEntries(cases) };
}
