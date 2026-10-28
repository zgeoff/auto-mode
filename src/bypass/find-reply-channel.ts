import type { ActionRequest } from '../request/types.ts';
import type { ReplyChannel } from '../scope/types.ts';

export function findReplyChannel(
  request: Readonly<ActionRequest>,
  channels: readonly ReplyChannel[],
): ReplyChannel | null {
  return (
    channels.find(
      (channel) =>
        channel.tool === request.toolName && request.toolInput[channel.field] === channel.recipient,
    ) ?? null
  );
}
