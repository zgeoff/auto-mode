import type { Experiment, Recording } from './define-experiment.ts';

export function requireRecording<Case>(
  experiment: Readonly<Experiment<Case>>,
  recording: string | null,
  live: boolean,
): Recording | null {
  if (recording === null) {
    return null;
  }

  const found = experiment.recordings.find((entry) => entry.name === recording);

  if (found === undefined) {
    const known = experiment.recordings.map((entry) => entry.name);

    throw new Error(
      `The ${experiment.name} experiment has no recording ${recording}. Known: ${known.length === 0 ? 'none' : known.join(', ')}.`,
    );
  }

  const liveStages = found.liveStages ?? [];

  if (live && liveStages.length === 0) {
    throw new Error('A run that replays a recording sends nothing; drop --live.');
  }

  const unsent = liveStages.filter(
    (name) => !experiment.stages.some((stage) => stage.name === name && stage.sends),
  );

  if (unsent.length > 0) {
    throw new Error(
      `The ${recording} recording names live stages the ${experiment.name} experiment does not send: ${unsent.join(', ')}.`,
    );
  }

  return found;
}
