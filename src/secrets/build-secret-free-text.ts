import { findSecret } from './find-secret.ts';

const MAX_SECRET_PASSES = 50;

export function buildSecretFreeText(
  text: string,
  toReplacement: (secret: string) => string,
): string {
  let current = text;

  for (let pass = 0; pass < MAX_SECRET_PASSES; pass += 1) {
    const finding = findSecret({ text: current, path: null });

    if (finding === null || finding.secret === '' || !current.includes(finding.secret)) {
      return current;
    }

    current = current.replaceAll(finding.secret, toReplacement(finding.secret));
  }

  return current;
}
