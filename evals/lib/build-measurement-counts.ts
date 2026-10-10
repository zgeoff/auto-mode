import { buildClopperPearsonInterval } from './build-clopper-pearson-interval.ts';
import { buildClusteredStandardError } from './build-clustered-standard-error.ts';
import { buildDesignEffect } from './build-design-effect.ts';
import { buildRuleOfThreeBound } from './build-rule-of-three-bound.ts';
import { buildWilsonInterval } from './build-wilson-interval.ts';
import type { MeasurementObservations } from './define-experiment.ts';
import type { MeasurementCount } from './run-summary-schema.ts';

// Distinct-case counts get the rule-of-three bound at zero events. Counts over
// actions or requests repeat cases, so their intervals are taken over the
// effective sample size the case-clustered design effect leaves.
export function buildMeasurementCounts(
  groups: readonly MeasurementObservations[],
): MeasurementCount[] {
  return groups.map((group) => {
    const total = group.observations.length;
    const events = group.observations.filter((entry) => entry.event).length;

    const cases = new Set(group.observations.map((entry) => entry.caseKey)).size;

    const clusteredObservations = group.observations.map((entry) => ({
      cluster: entry.caseKey,
      value: entry.event ? 1 : 0,
    }));

    const isCases = group.unit === 'cases';
    const clustered = buildClusteredStandardError(clusteredObservations);
    const effect = isCases ? null : buildDesignEffect(clusteredObservations);
    const intervalEvents = effect === null ? events : effect.effectiveEvents;
    const intervalTotal = effect === null ? total : effect.effectiveTotal;
    const wilson = buildWilsonInterval(intervalEvents, intervalTotal);
    const exact = buildClopperPearsonInterval(intervalEvents, intervalTotal);

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
      ruleOfThree: isCases && events === 0 ? toRounded(buildRuleOfThreeBound(total)) : null,
      clusteredStandardError:
        isCases || clustered.standardError === null ? null : toRounded(clustered.standardError),
      designEffect: effect === null ? null : toRounded(effect.designEffect),
      effectiveTotal: effect === null ? null : toRounded(effect.effectiveTotal),
    };
  });
}

function toRounded(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
