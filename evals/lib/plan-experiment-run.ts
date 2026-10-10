import { makeSeededRandom } from './make-seeded-random.ts';

export interface PlannedStage {
  readonly name: string;
  readonly sends: boolean;
}

export interface PlannedUnit {
  readonly caseKey: string;
  readonly sample: number;
  readonly stages: readonly PlannedStage[];
}

export interface ExperimentPlan {
  readonly cases: number;
  readonly samples: number;
  readonly stages: number;
  readonly stageRuns: number;
  readonly requests: number;
  readonly recorded: number;
  readonly units: readonly PlannedUnit[];
}

export interface PlanInput {
  readonly caseKeys: readonly string[];
  readonly samples: number;
  readonly stages: readonly PlannedStage[];
  readonly seed: number;
  readonly recorded: readonly string[];
}

// The plan is every case × sample × stage in a seeded order of (case, sample)
// units, minus the stage runs a resumed run already recorded. Only a stage that
// sends adds requests.
export function planExperimentRun(input: Readonly<PlanInput>): ExperimentPlan {
  const ordered = sortSeeded(
    input.caseKeys.flatMap((caseKey) =>
      Array.from({ length: input.samples }, (_, sample) => ({ caseKey, sample })),
    ),
    input.seed,
  );

  const recorded = new Set(input.recorded);

  const units = ordered.flatMap((unit) => {
    const stages = input.stages.filter(
      (stage) => !recorded.has(buildStageRunKey(unit.caseKey, unit.sample, stage.name)),
    );

    return stages.length === 0 ? [] : [{ ...unit, stages }];
  });

  const all = input.caseKeys.length * input.samples * input.stages.length;
  const stageRuns = units.reduce((sum, unit) => sum + unit.stages.length, 0);

  return {
    cases: input.caseKeys.length,
    samples: input.samples,
    stages: input.stages.length,
    stageRuns,
    requests: units.reduce(
      (sum, unit) => sum + unit.stages.filter((stage) => stage.sends).length,
      0,
    ),
    recorded: all - stageRuns,
    units,
  };
}

export function buildStageRunKey(caseKey: string, sample: number, stage: string): string {
  return JSON.stringify([caseKey, sample, stage]);
}

// A Fisher-Yates shuffle over indices, drawn from the seeded generator.
function sortSeeded<T>(items: readonly T[], seed: number): T[] {
  const random = makeSeededRandom(seed);
  const order = items.map((_, index) => index);

  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const held = order[index] ?? index;

    order[index] = order[swap] ?? swap;
    order[swap] = held;
  }

  return order.flatMap((index) => {
    const item = items[index];

    return item === undefined ? [] : [item];
  });
}
