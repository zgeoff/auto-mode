import { findReplyChannel } from '../scope/find-reply-channel.ts';
import type { OwnedScope, ReplyChannel } from '../scope/types.ts';

export type ReplyCallClassification =
  | { readonly kind: 'bypass'; readonly channel: ReplyChannel }
  | { readonly kind: 'exempt'; readonly rules: readonly string[] }
  | { readonly kind: 'none' };

export async function classifyReplyCall(
  call: Readonly<{ toolName: string; toolInput: Readonly<Record<string, unknown>> }>,
  scope: Readonly<OwnedScope> | null,
  hasConfiguredDenies: boolean,
): Promise<ReplyCallClassification> {
  const channel =
    scope === null ? null : findReplyChannel(call.toolName, call.toolInput, scope.replyChannels);

  if (channel === null) {
    return { kind: 'none' };
  }

  // The secret rule set adds about 10 ms to a CLI start, so only a message
  // through a reply channel loads it.
  const reply = await import('./classify-reply-message.ts');

  if (reply.classifyReplyMessage(call.toolInput).kind !== 'bypass') {
    return { kind: 'none' };
  }

  return hasConfiguredDenies
    ? { kind: 'exempt', rules: ['Outbound Communication'] }
    : { kind: 'bypass', channel };
}
