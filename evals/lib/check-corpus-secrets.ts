import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';

export async function checkCorpusSecrets(
  directory: string,
  env: Readonly<Record<string, string | undefined>>,
): Promise<boolean> {
  const exitCode = await runGitleaks(directory, env);

  if (exitCode === 0) {
    return true;
  }

  await rm(directory, { recursive: true, force: true });

  return false;
}

// gitleaks reads GITLEAKS_CONFIG from its environment, and a config there can
// hold allowlists that hide a finding.
function runGitleaks(
  directory: string,
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
    directory,
    directory,
  ];

  return new Promise((resolve) => {
    const child = spawn('gitleaks', args, {
      cwd: directory,
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
