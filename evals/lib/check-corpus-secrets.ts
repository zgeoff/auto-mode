import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';

// Runs gitleaks with its default rules over the dir and removes the dir unless
// the scan passes. A scan that cannot run counts as a failure.
export async function checkCorpusSecrets(
  dir: string,
  env: Readonly<Record<string, string | undefined>>,
): Promise<boolean> {
  const exitCode = await runGitleaks(dir, env);

  if (exitCode === 0) {
    return true;
  }

  await rm(dir, { recursive: true, force: true });

  return false;
}

// The child gets PATH and HOME alone, so a GITLEAKS_CONFIG in the caller's
// environment cannot swap in a config whose allowlists hide a finding.
function runGitleaks(
  dir: string,
  env: Readonly<Record<string, string | undefined>>,
): Promise<number | null> {
  const args = [
    'dir',
    '--no-banner',
    '--redact',
    '--exit-code',
    '1',
    '--ignore-gitleaks-allow',
    '--gitleaks-ignore-path',
    dir,
    dir,
  ];

  return new Promise((resolve) => {
    const child = spawn('gitleaks', args, {
      cwd: dir,
      env: { PATH: env['PATH'], HOME: env['HOME'] },
      stdio: 'ignore',
    });

    child.once('error', () => {
      resolve(null);
    });

    child.once('close', (code) => {
      resolve(code);
    });
  });
}
