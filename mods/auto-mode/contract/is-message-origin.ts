import { MESSAGE_ORIGINS } from './message-origins.ts';
import type { MessageOrigin } from './types.ts';

export function isMessageOrigin(value: string): value is MessageOrigin {
  return MESSAGE_ORIGINS.some((origin) => origin === value);
}
