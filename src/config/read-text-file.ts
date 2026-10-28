import { readFile } from 'node:fs/promises';

export function readTextFile(path: string): Promise<string> {
  return readFile(path, 'utf8');
}
