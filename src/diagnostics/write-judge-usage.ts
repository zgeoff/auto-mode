import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { HostEnvironment, OutputStream } from '../config/types.ts';
import type { JudgeUsage } from '../judge/types.ts';

export async function writeJudgeUsage(
  usage: Readonly<JudgeUsage>,
  host: Readonly<HostEnvironment>,
  warnings: Readonly<OutputStream>,
): Promise<void> {
  const path = host.env['AUTO_MODE_DEBUG_PATH'];

  if (path === undefined || path === '') {
    return;
  }

  const line = { time: new Date().toISOString(), ...usage };

  try {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await appendFile(path, `${JSON.stringify(line)}\n`, { mode: 0o600 });
  } catch {
    warnings.write('auto-mode: judge debug line unavailable\n');
  }
}
