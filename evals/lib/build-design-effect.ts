import type { ClusteredObservation } from './build-clustered-standard-error.ts';
import { buildClusteredStandardError } from './build-clustered-standard-error.ts';

export interface DesignEffect {
  readonly designEffect: number;
  readonly effectiveTotal: number;
  readonly effectiveEvents: number;
}

// The case-clustered variance of the rate over the independent-sample variance,
// held at 1 or more. Where either is zero or undefined, as at a rate of 0 or 1,
// it is the mean samples per case, so every case counts once.
export function buildDesignEffect(observations: readonly ClusteredObservation[]): DesignEffect {
  const total = observations.length;
  const clustered = buildClusteredStandardError(observations);
  const rate = clustered.mean;
  const binomialVariance = total === 0 ? 0 : (rate * (1 - rate)) / total;

  const designEffect =
    clustered.standardError === null || binomialVariance === 0
      ? Math.max(1, total / Math.max(1, clustered.clusters))
      : Math.max(1, clustered.standardError ** 2 / binomialVariance);

  const effectiveTotal = total / designEffect;

  return { designEffect, effectiveTotal, effectiveEvents: rate * effectiveTotal };
}
