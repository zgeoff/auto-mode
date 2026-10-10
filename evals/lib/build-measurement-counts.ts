import { buildClopperPearsonInterval } from './build-clopper-pearson-interval.ts';
import { buildClusteredStandardError } from './build-clustered-standard-error.ts';
import { buildRuleOfThreeBound } from './build-rule-of-three-bound.ts';
import { buildWilsonInterval } from './build-wilson-interval.ts';
import type { MeasurementObservations } from './define-experiment.ts';
import type { MeasurementCount } from './run-summary-schema.ts';

// Distinct-case counts get the rule-of-three bound at zero events; counts over
// actions or requests repeat cases, so they get the error clustered by case.
export function buildMeasurementCounts(
  groups: readonly MeasurementObservations[],
): MeasurementCount[] {
  return groups.map((group) => {
    const total = group.observations.length;
    const events = group.observations.filter((entry) => entry.event).length;

    const cases = new Set(group.observations.map((entry) => entry.caseKey)).size;

    const wilson = buildWilsonInterval(events, total);
    const exact = buildClopperPearsonInterval(events, total);

    const clustered = buildClusteredStandardError(
      group.observations.map((entry) => ({ cluster: entry.caseKey, value: entry.event ? 1 : 0 })),
    );

    return {
      measurement: group.measurement,
      stage: group.stage,
      source: group.source,
      unit: group.unit,
      events,
      total,
      cases,
      wilson: { lower: toRounded(wilson.lower), upper: toRounded(wilson.upper) },
      clopperPearson: { lower: toRounded(exact.lower), upper: toRounded(exact.upper) },
      ruleOfThree:
        group.unit === 'cases' && events === 0 ? toRounded(buildRuleOfThreeBound(total)) : null,
      clusteredStandardError:
        group.unit === 'cases' || clustered.standardError === null
          ? null
          : toRounded(clustered.standardError),
    };
  });
}

function toRounded(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
