import type { TextFileReader } from '../config/types.ts';
import { loadScopeFile } from './load-scope-file.ts';

export async function probeLauncherSpawner(
  location: string | undefined,
  readTextFile: TextFileReader,
): Promise<boolean> {
  const load = await loadScopeFile(location, readTextFile);

  return (
    load.kind === 'malformed' || (load.kind === 'scope' && load.scope.replyChannels.length > 0)
  );
}
