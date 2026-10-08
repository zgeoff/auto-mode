import { homedir } from 'node:os';
import type { HostEnvironment } from './types.ts';

export function getHostEnvironment(): HostEnvironment {
  return { env: process.env, home: homedir() };
}
