import type { DirectUserMessage } from './types.ts';

export function findCurrentDirectUserMessage(
  message: Readonly<DirectUserMessage> | null | undefined,
): string | null {
  return message === null || message === undefined || message.freshness === 'stale'
    ? null
    : message.text;
}
