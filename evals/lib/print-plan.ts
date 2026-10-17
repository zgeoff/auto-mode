import type { ActiveStage } from './pick-stages.ts';
import type { ExperimentPlan } from './plan-experiment-run.ts';

export function printPlan<Case>(
  plan: Readonly<ExperimentPlan>,
  stages: readonly ActiveStage<Case>[],
  notMeasured: readonly string[],
  isCounted: boolean,
  print: (line: string) => unknown,
): void {
  print(
    `Plan: ${plan.cases} cases × ${plan.samples} samples × ${plan.stages} stages; ` +
      `${plan.stageRuns} stage runs to go, ${plan.recorded} already recorded, ` +
      `${plan.requests} model requests.`,
  );

  for (const stage of stages.filter((entry) => entry.sends)) {
    const requests = plan.units.filter((unit) =>
      unit.stages.some((planned) => planned.name === stage.name && planned.sends),
    ).length;

    const line =
      stage.reviews === undefined || isCounted
        ? `  ${stage.name}: ${requests} model requests`
        : `  ${stage.name}: at most ${requests} model requests, one for each ${stage.reviews} deny`;

    print(line);
  }

  for (const entry of notMeasured) {
    print(`Not measured: ${entry}`);
  }
}
