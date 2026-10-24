import type { JevClass } from './classify-live-jev-answers.ts';

export type JevReading = 'release-all-allow' | 'shipped';

export function pickJevVerdict(jev: Readonly<JevClass>, reading: JevReading): 'allow' | 'deny' {
  if (jev.kind === 'allow') {
    return 'allow';
  }

  return jev.kind === 'all-allow-ask' && reading === 'release-all-allow' ? 'allow' : 'deny';
}
