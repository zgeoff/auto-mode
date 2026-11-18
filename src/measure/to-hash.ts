import { createHash } from 'node:crypto';

export function toHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
