import { join } from 'node:path';
import type { CaptureConfig } from '../config/config.ts';
import type { HostEnvironment } from '../config/types.ts';
import { resolveStateDir } from '../state/resolve-state-dir.ts';

export function resolveCaptureDir(
  capture: Readonly<CaptureConfig>,
  host: Readonly<HostEnvironment>,
): string {
  return capture.dir ?? join(resolveStateDir(host), 'captures');
}
