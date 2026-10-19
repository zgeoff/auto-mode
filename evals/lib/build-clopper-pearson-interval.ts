import type { Interval } from './build-wilson-interval.ts';

const ALPHA = 0.05;

// The exact interval as beta quantiles, which also takes the fractional counts a
// design effect leaves: the lower bound is Beta(x, n - x + 1) at 2.5% and the
// upper bound Beta(x + 1, n - x) at 97.5%.
export function buildClopperPearsonInterval(events: number, total: number): Interval {
  if (total === 0) {
    return { lower: 0, upper: 1 };
  }

  const lower = events <= 0 ? 0 : getQuantile(events, total - events + 1, ALPHA / 2);
  const upper = events >= total ? 1 : getQuantile(events + 1, total - events, 1 - ALPHA / 2);

  return { lower, upper };
}

const BISECTIONS = 100;

// The regularized incomplete beta rises in x, so bisection converges on the one crossing.
function getQuantile(alphaShape: number, betaShape: number, target: number): number {
  let low = 0;
  let high = 1;

  for (let step = 0; step < BISECTIONS; step += 1) {
    const middle = (low + high) / 2;

    if (buildRegularizedBeta(middle, alphaShape, betaShape) < target) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return (low + high) / 2;
}

// I_x(α, β) by its continued fraction, taken on the side where it converges fast.
function buildRegularizedBeta(x: number, alphaShape: number, betaShape: number): number {
  if (x <= 0) {
    return 0;
  }

  if (x >= 1) {
    return 1;
  }

  const front = Math.exp(
    buildLogGamma(alphaShape + betaShape) -
      buildLogGamma(alphaShape) -
      buildLogGamma(betaShape) +
      alphaShape * Math.log(x) +
      betaShape * Math.log1p(-x),
  );

  if (x < (alphaShape + 1) / (alphaShape + betaShape + 2)) {
    return (front * buildBetaFraction(x, alphaShape, betaShape)) / alphaShape;
  }

  return 1 - (front * buildBetaFraction(1 - x, betaShape, alphaShape)) / betaShape;
}

const LANCZOS = [
  0.9999999999998099, 676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406,
  12.507343278686905, -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7,
];

// The Lanczos approximation with g = 7, accurate to about 15 digits for positive x.
function buildLogGamma(x: number): number {
  if (x < 0.5) {
    return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - buildLogGamma(1 - x);
  }

  const shifted = x - 1;
  let sum = LANCZOS[0] ?? 0;

  for (let index = 1; index < LANCZOS.length; index += 1) {
    sum += (LANCZOS[index] ?? 0) / (shifted + index);
  }

  const lanczosBase = shifted + 7.5;

  return (
    0.5 * Math.log(2 * Math.PI) +
    (shifted + 0.5) * Math.log(lanczosBase) -
    lanczosBase +
    Math.log(sum)
  );
}

const FRACTION_STEPS = 300;
const FRACTION_EPSILON = 1e-15;
const TINY = 1e-300;

// The modified Lentz evaluation of the incomplete beta continued fraction.
function buildBetaFraction(x: number, alphaShape: number, betaShape: number): number {
  let lentzC = 1;
  let lentzD = 1 - ((alphaShape + betaShape) * x) / (alphaShape + 1);

  lentzD = 1 / (Math.abs(lentzD) < TINY ? TINY : lentzD);

  let fraction = lentzD;

  for (let term = 1; term <= FRACTION_STEPS; term += 1) {
    const even =
      (term * (betaShape - term) * x) / ((alphaShape + 2 * term - 1) * (alphaShape + 2 * term));

    lentzD = 1 / buildNonZero(1 + even * lentzD);
    lentzC = buildNonZero(1 + even / lentzC);
    fraction *= lentzD * lentzC;

    const odd =
      -((alphaShape + term) * (alphaShape + betaShape + term) * x) /
      ((alphaShape + 2 * term) * (alphaShape + 2 * term + 1));

    lentzD = 1 / buildNonZero(1 + odd * lentzD);
    lentzC = buildNonZero(1 + odd / lentzC);

    const delta = lentzD * lentzC;

    fraction *= delta;

    if (Math.abs(delta - 1) < FRACTION_EPSILON) {
      break;
    }
  }

  return fraction;
}

function buildNonZero(value: number): number {
  return Math.abs(value) < TINY ? TINY : value;
}
