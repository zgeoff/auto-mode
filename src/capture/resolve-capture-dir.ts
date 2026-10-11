import { join } from 'node:path';
import type { CaptureConfig } from '../config/config.ts';
import type { HostEnvironment } from '../config/types.ts';
import { resolveXDGDir } from '../state/resolve-xdg-dir.ts';

export function resolveCaptureDir(
  capture: Readonly<CaptureConfig>,
  host: Readonly<HostEnvironment>,
): string {
  return capture.dir ?? join(resolveXDGDir(host, 'state'), 'captures');
}
