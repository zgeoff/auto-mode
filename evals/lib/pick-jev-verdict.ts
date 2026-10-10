import type { JevClass } from './classify-live-jev-answers.ts';

export type JevReading = 'release-all-allow' | 'shipped';

// The shipped reading allows only a confident allow on every rule;
// release-all-allow also allows an ask whose every answer chose allow.
export function pickJevVerdict(jev: Readonly<JevClass>, reading: JevReading): 'allow' | 'deny' {
  if (jev.kind === 'allow') {
    return 'allow';
  }

  return jev.kind === 'all-allow-ask' && reading === 'release-all-allow' ? 'allow' : 'deny';
}
