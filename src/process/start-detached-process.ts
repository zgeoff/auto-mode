import { spawn } from 'node:child_process';

// A detached child leads its own process group, so a kill of this process's
// group leaves it alone.
export function startDetachedProcess(
  file: string,
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): void {
  const child = spawn(file, args, { detached: true, stdio: 'ignore', env });

  child.on('error', () => {});
  child.unref();
}
