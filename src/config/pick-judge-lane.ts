import { match } from 'ts-pattern';
import type { ProviderConfig } from './config.ts';

export type JudgeLane =
  | { readonly transport: 'agent-sdk'; readonly credential: 'none' }
  | { readonly transport: 'messages'; readonly credential: 'api-key' }
  | { readonly transport: 'refused'; readonly credential: 'api-key' };

// The Agent SDK signs in through Claude Code, so only the Messages API needs a
// key. Jev returns typed answers and cannot write a reason, so it never judges,
// though a Jev entry still names the key it would send.
export function pickJudgeLane(provider: Readonly<ProviderConfig>): JudgeLane {
  return match(provider.protocol ?? 'messages')
    .returnType<JudgeLane>()
    .with('claude-code', () => ({ transport: 'agent-sdk', credential: 'none' }))
    .with('messages', () => ({ transport: 'messages', credential: 'api-key' }))
    .with('system-one', () => ({ transport: 'refused', credential: 'api-key' }))
    .exhaustive();
}
