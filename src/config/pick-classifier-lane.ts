import { match } from 'ts-pattern';
import type { ProviderConfig } from './config.ts';

export type ClassifierLane =
  | { readonly kind: 'jev' }
  | { readonly kind: 'refused'; readonly protocol: 'messages' | 'claude-code' };

// Jev answers typed questions, which the classifier asks; every other kind
// writes prose and only judges.
export function pickClassifierLane(provider: Readonly<ProviderConfig>): ClassifierLane {
  return match(provider.protocol ?? 'messages')
    .returnType<ClassifierLane>()
    .with('system-one', () => ({ kind: 'jev' }))
    .with('messages', 'claude-code', (protocol) => ({ kind: 'refused', protocol }))
    .exhaustive();
}
