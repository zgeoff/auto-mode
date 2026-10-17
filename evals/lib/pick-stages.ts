import type { Experiment, Recording } from './define-experiment.ts';

export type ActiveStage<Case> = Experiment<Case>['stages'][number];

// A recorded run replays each stage that can, runs each stage that sends
// nothing, and names each stage that would have to send as not measured. A live
// run sends the recording's live stages instead of replaying them.
export interface PickedStages<Case> {
  readonly active: readonly ActiveStage<Case>[];
  readonly dropped: readonly string[];
  readonly notMeasured: readonly string[];
}

export function pickStages<Case>(
  experiment: Readonly<Experiment<Case>>,
  recording: Recording | null,
  live: boolean,
): PickedStages<Case> {
  if (recording === null) {
    return { active: experiment.stages, dropped: [], notMeasured: [] };
  }

  const active: ActiveStage<Case>[] = [];
  const dropped: string[] = [];
  const notMeasured: string[] = [];
  const liveStages = live ? (recording.liveStages ?? []) : [];

  for (const stage of experiment.stages) {
    if (liveStages.includes(stage.name)) {
      active.push(stage);
    } else if (stage.replay !== undefined) {
      active.push({ ...stage, sends: false, run: stage.replay });
    } else if (stage.sends) {
      dropped.push(stage.name);

      notMeasured.push(
        `stage ${stage.name}: the ${recording.name} recording holds no answers for it`,
      );
    } else {
      active.push(stage);
    }
  }

  return { active, dropped, notMeasured };
}
