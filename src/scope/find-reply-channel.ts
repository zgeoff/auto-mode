import type { ReplyChannel } from './types.ts';

export function findReplyChannel(
  tool: string,
  input: Readonly<Record<string, unknown>>,
  channels: readonly ReplyChannel[],
): ReplyChannel | null {
  return (
    channels.find(
      (channel) => channel.tool === tool && input[channel.field] === channel.recipient,
    ) ?? null
  );
}
