import { createHmac } from 'node:crypto';

export function derivePlaceholder(kind: string, value: string, salt: string): string {
  const digest = createHmac('sha256', salt).update(`${kind}\0${value.toLowerCase()}`).digest('hex');

  return `${kind}-${digest.slice(0, 8)}`;
}
