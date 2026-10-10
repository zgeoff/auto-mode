import type { ClusteredObservation } from './build-clustered-standard-error.ts';

export interface PairedDifference {
  readonly shared: number;
  readonly meanDifference: number | null;
  readonly standardError: number | null;
}

// Each case becomes its mean over its samples in each run; the difference b - a
// is taken per shared case, so the case is the unit and repeated samples of one
// case count once. Fewer than two shared cases leave the error undefined.
export function buildPairedDifference(
  a: readonly ClusteredObservation[],
  b: readonly ClusteredObservation[],
): PairedDifference {
  const meansA = buildClusterMeans(a);
  const meansB = buildClusterMeans(b);

  const differences = [...meansA].flatMap(([cluster, meanA]) => {
    const meanB = meansB.get(cluster);

    return meanB === undefined ? [] : [meanB - meanA];
  });

  const shared = differences.length;

  if (shared === 0) {
    return { shared, meanDifference: null, standardError: null };
  }

  const meanDifference = differences.reduce((sum, value) => sum + value, 0) / shared;

  if (shared < 2) {
    return { shared, meanDifference, standardError: null };
  }

  const variance =
    differences.reduce((sum, value) => sum + (value - meanDifference) ** 2, 0) / (shared - 1);

  return { shared, meanDifference, standardError: Math.sqrt(variance / shared) };
}

function buildClusterMeans(observations: readonly ClusteredObservation[]): Map<string, number> {
  const sums = new Map<string, { total: number; count: number }>();

  for (const entry of observations) {
    const held = sums.get(entry.cluster) ?? { total: 0, count: 0 };

    sums.set(entry.cluster, { total: held.total + entry.value, count: held.count + 1 });
  }

  return new Map([...sums].map(([cluster, sum]) => [cluster, sum.total / sum.count]));
}
