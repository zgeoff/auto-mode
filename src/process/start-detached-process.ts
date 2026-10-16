import { spawn } from 'node:child_process';

// The child outlives this process: it leads its own group, so the mod's kill of
// this run's group leaves it alone, and nothing of it holds this process open.
export function startDetachedProcess(
  file: string,
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): void {
  const child = spawn(file, args, { detached: true, stdio: 'ignore', env });

  child.on('error', () => {});
  child.unref();
}
