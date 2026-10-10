import { execFileSync } from 'node:child_process';

const GUARDED_PATHS = ['evals', 'fixtures', 'policy', 'scripts', 'src'];

export interface PublicCommit {
  readonly commit: string;
  readonly dirty: boolean;
}

// A live run records the commit it ran against, so the code, corpora and policy
// it read must be that commit's; an offline run may read a dirty tree, and its
// run records that it did.
export function readPublicCommit(repoRoot: string, requireClean: boolean): PublicCommit {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();

  const changes = execFileSync('git', ['status', '--porcelain', '--', ...GUARDED_PATHS], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  const dirty = changes.trim() !== '';

  if (requireClean && dirty) {
    throw new Error('Commit the corpus, the experiments and the source before a live run.');
  }

  return { commit, dirty };
}
