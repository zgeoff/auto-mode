export interface ClusteredObservation {
  readonly cluster: string;
  readonly value: number;
}

export interface ClusteredEstimate {
  readonly mean: number;
  readonly clusters: number;
  readonly standardError: number | null;
}

// The cluster-robust (sandwich) standard error of a mean: residuals are summed
// within each cluster before squaring, with the G/(G-1) small-sample factor.
// Fewer than two clusters leave the error undefined.
export function buildClusteredStandardError(
  observations: readonly ClusteredObservation[],
): ClusteredEstimate {
  const count = observations.length;

  if (count === 0) {
    return { mean: 0, clusters: 0, standardError: null };
  }

  const mean = observations.reduce((sum, entry) => sum + entry.value, 0) / count;

  const residuals = new Map<string, number>();

  for (const entry of observations) {
    residuals.set(entry.cluster, (residuals.get(entry.cluster) ?? 0) + entry.value - mean);
  }

  const clusters = residuals.size;

  if (clusters < 2) {
    return { mean, clusters, standardError: null };
  }

  const squares = [...residuals.values()].reduce((sum, residual) => sum + residual * residual, 0);

  return {
    mean,
    clusters,
    standardError: Math.sqrt((clusters / (clusters - 1)) * squares) / count,
  };
}
