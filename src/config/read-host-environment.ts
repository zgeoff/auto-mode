import { homedir } from 'node:os';
import { SCRATCH_PATHS } from '../containment/scratch-paths.ts';
import type { HostEnvironment } from './types.ts';

export function readHostEnvironment(): HostEnvironment {
  return { env: process.env, home: homedir(), scratchPaths: SCRATCH_PATHS };
}
