// Zero events in n independent cases bound the rate below about 3/n at 95%.
export function buildRuleOfThreeBound(total: number): number {
  return total === 0 ? 1 : Math.min(1, 3 / total);
}
