import type { CaseSet } from './define-experiment.ts';
import type { MeasurementCase } from './load-measurement-sets.ts';
import type { RecordedAnswers } from './load-recorded-answers.ts';

// Gives each case of the set the recorded answers its ID holds for the stage.
export function buildRecordedSet(
  set: Readonly<CaseSet<MeasurementCase>>,
  stage: string,
  recorded: Readonly<RecordedAnswers>,
): CaseSet<MeasurementCase> {
  const cases = Object.entries(set.cases).map(([key, entry]): [string, MeasurementCase] => {
    const answers = recorded.answers[entry.id];

    return answers === undefined
      ? [key, entry]
      : [key, { ...entry, recorded: { ...entry.recorded, [stage]: answers } }];
  });

  return { corpus: set.corpus, dir: set.dir, cases: Object.fromEntries(cases) };
}
