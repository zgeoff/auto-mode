import type { Interval } from './build-wilson-interval.ts';

const ALPHA = 0.05;
const BISECTIONS = 100;

// The exact interval: each bound is the rate at which the observed count sits at
// the 2.5% tail of the binomial, found by bisection on the binomial tail.
export function buildClopperPearsonInterval(events: number, total: number): Interval {
  if (total === 0) {
    return { lower: 0, upper: 1 };
  }

  const logFactorials = buildLogFactorials(total);

  const lower =
    events === 0
      ? 0
      : findRate(
          (rate) => 1 - buildLowerTail(events - 1, total, rate, logFactorials),
          ALPHA / 2,
          'rising',
        );

  const upper =
    events === total
      ? 1
      : findRate(
          (rate) => buildLowerTail(events, total, rate, logFactorials),
          ALPHA / 2,
          'falling',
        );

  return { lower, upper };
}

function buildLogFactorials(total: number): number[] {
  const values = [0];

  for (let index = 1; index <= total; index += 1) {
    values.push((values[index - 1] ?? 0) + Math.log(index));
  }

  return values;
}

// The tail is monotone in the rate, so bisection converges on the one crossing.
function findRate(
  tail: (rate: number) => number,
  target: number,
  direction: 'rising' | 'falling',
): number {
  let low = 0;
  let high = 1;

  for (let step = 0; step < BISECTIONS; step += 1) {
    const middle = (low + high) / 2;
    const isBelow = tail(middle) < target;

    if (isBelow === (direction === 'rising')) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return (low + high) / 2;
}

// P(X <= events) for X ~ Binomial(total, rate).
function buildLowerTail(
  events: number,
  total: number,
  rate: number,
  logFactorials: readonly number[],
): number {
  let sum = 0;

  for (let count = 0; count <= events; count += 1) {
    const logChoose =
      (logFactorials[total] ?? 0) -
      (logFactorials[count] ?? 0) -
      (logFactorials[total - count] ?? 0);

    sum += Math.exp(logChoose + count * Math.log(rate) + (total - count) * Math.log1p(-rate));
  }

  return Math.min(1, sum);
}
