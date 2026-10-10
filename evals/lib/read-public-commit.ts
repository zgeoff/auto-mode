import { execFileSync } from 'node:child_process';

const GUARDED_PATHS = ['evals', 'fixtures', 'policy', 'scripts', 'src'];

// A live run records the commit it ran against, so the code, corpora and policy
// it read must be that commit's; an offline run may read a dirty tree.
export function readPublicCommit(repoRoot: string, requireClean: boolean): string {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();

  if (requireClean) {
    const changes = execFileSync('git', ['status', '--porcelain', '--', ...GUARDED_PATHS], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    if (changes.trim() !== '') {
      throw new Error('Commit the corpus, the experiments and the source before a live run.');
    }
  }

  return commit;
}
