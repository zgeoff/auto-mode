export interface Interval {
  readonly lower: number;
  readonly upper: number;
}

// The two-sided 95% normal quantile.
const Z = 1.959963984540054;

// A proportion with no observations is bounded by nothing but [0, 1].
export function buildWilsonInterval(events: number, total: number): Interval {
  if (total === 0) {
    return { lower: 0, upper: 1 };
  }

  const rate = events / total;
  const zSquared = Z * Z;
  const scale = 1 + zSquared / total;
  const center = (rate + zSquared / (2 * total)) / scale;

  const half =
    (Z / scale) * Math.sqrt((rate * (1 - rate)) / total + zSquared / (4 * total * total));

  return { lower: Math.max(0, center - half), upper: Math.min(1, center + half) };
}
