import { cp, mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { readEnclosingWorkTree } from 'auto-mode/eval';
import { buildAnonymisedCorpus } from './build-anonymised-corpus.ts';
import { checkCorpusSecrets } from './check-corpus-secrets.ts';
import { loadCaptureRecords } from './load-capture-records.ts';

export interface AnonymiseRequest {
  readonly captureFiles: readonly string[];
  readonly outDir: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly salt: string;
  readonly stagingRoot: string;
}

export interface AnonymiseResult {
  readonly outDir: string;
  readonly cases: number;
}

export async function writeAnonymisedCorpus(
  request: Readonly<AnonymiseRequest>,
): Promise<AnonymiseResult> {
  const outDir = await resolveOutDir(request.outDir);
  const records = await loadCaptureRecords(request.captureFiles);

  const corpus = buildAnonymisedCorpus(
    records.map((record) => ({
      cwd: record.request.cwd,
      request: record.request,
      verdict: record.verdict,
      decidingStage: record.decidingStage,
    })),
    request.salt,
  );

  const stagingWorkTree = await readEnclosingWorkTree(request.stagingRoot);

  if (stagingWorkTree !== null) {
    throw new Error(
      `Refusing to stage the corpus in ${request.stagingRoot}: it is inside the git work tree ${stagingWorkTree}.`,
    );
  }

  const staging = await mkdtemp(join(request.stagingRoot, 'auto-mode-anonymise-'));

  try {
    const labelsTodo = {
      schemaVersion: 1,
      corpus: basename(outDir),
      key: 'id',
      cases: Object.fromEntries(corpus.cases.map((entry) => [entry.id, { source: 'recorded' }])),
    };

    await writeFile(join(staging, 'cases.json'), `${JSON.stringify(corpus, null, 2)}\n`);
    await writeFile(join(staging, 'labels.todo.json'), `${JSON.stringify(labelsTodo, null, 2)}\n`);

    const clean = await checkCorpusSecrets(staging, request.env);

    if (!clean) {
      throw new Error(
        'The secret scan did not pass on the anonymised corpus, so nothing was written. Run gitleaks over a copy to find the case, then extend the anonymiser.',
      );
    }

    await cp(staging, outDir, { recursive: true, errorOnExist: true, force: false });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }

  return { outDir, cases: corpus.cases.length };
}

async function resolveOutDir(outDir: string): Promise<string> {
  const exists = await stat(outDir).catch(() => null);

  if (exists !== null) {
    throw new Error(`Refusing to write into ${outDir}: it already exists.`);
  }

  const parent = await realpath(dirname(outDir)).catch(() => null);

  if (parent === null) {
    throw new Error(`Refusing to write into ${outDir}: its parent directory does not exist.`);
  }

  const real = join(parent, basename(outDir));

  const workTree = await readEnclosingWorkTree(real);

  if (workTree !== null) {
    throw new Error(
      `Refusing to write into ${outDir}: it is inside the git work tree ${workTree}. Write the corpus outside every repository, read every case, then copy the reviewed files into evals/corpora/.`,
    );
  }

  return real;
}
