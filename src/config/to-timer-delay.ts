// AbortSignal.timeout throws on a delay that is not an integer, where setTimeout
// fires a fractional delay at the next whole millisecond and one under 1 ms at 1 ms.
export function toTimerDelay(ms: number): number {
  return Math.max(1, Math.ceil(ms));
}
