export const SEPARATORS = ['&&', '||', ';', '|', '&', '\n'];

// Longest first, so `>>` is read before `>`.
export const REDIRECTS = [
  '&>>',
  '&>',
  '<<<',
  '<<-',
  '<<',
  '<&',
  '<>',
  '<(',
  '<',
  '>>',
  '>|',
  '>&',
  '>(',
  '>',
];

export function findOperator(
  operators: readonly string[],
  text: string,
  index: number,
): string | undefined {
  return operators.find((operator) => text.startsWith(operator, index));
}
