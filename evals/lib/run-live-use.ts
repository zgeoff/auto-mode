import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { LiveUseMeasures } from './build-live-use-summary.ts';
import { buildLiveUseSummary } from './build-live-use-summary.ts';
import { loadActionLog } from './load-action-log.ts';
import { toHash } from './to-hash.ts';
import { writeReport } from './write-report.ts';

export interface LiveUseOptions {
  readonly logPath: string;
  readonly since: string | null;
  readonly resultsDir: string;
  readonly publicCommit: string;
  readonly dirtyTree: boolean;
  readonly now: () => Date;
}

export interface LiveUseConfig {
  readonly schemaVersion: 1;
  readonly experiment: 'live-use';
  readonly publicCommit: string;
  readonly dirtyTree: boolean;
  readonly logHash: string;
  readonly recordSchemaVersion: 3;
  readonly since: string | null;
  readonly startedAt: string;
}

export interface LiveUseSummary {
  readonly runID: string;
  readonly config: LiveUseConfig;
  readonly log: {
    readonly lines: number;
    readonly skippedVersions: Readonly<Record<string, number>>;
    readonly beforeSince: number;
    readonly tornLineCharacters: number | null;
  };
  readonly measures: LiveUseMeasures;
}

export interface LiveUseResult {
  readonly runDir: string;
  readonly summary: LiveUseSummary;
}

// The log path stays out of the summary: it can hold a user name, and the log
// hash already identifies the input.
export async function runLiveUse(options: Readonly<LiveUseOptions>): Promise<LiveUseResult> {
  const log = await loadActionLog(options.logPath, options.since);

  const frozen = {
    schemaVersion: 1 as const,
    experiment: 'live-use' as const,
    publicCommit: options.publicCommit,
    dirtyTree: options.dirtyTree,
    logHash: log.logHash,
    recordSchemaVersion: 3 as const,
    since: options.since,
  };

  const startedAt = options.now().toISOString();
  const stamp = startedAt.replaceAll(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const runID = `${stamp}-${toHash(JSON.stringify(frozen)).slice(0, 8)}`;
  const runDir = join(options.resultsDir, 'runs', 'live-use', runID);

  const summary: LiveUseSummary = {
    runID,
    config: { ...frozen, startedAt },
    log: {
      lines: log.lines,
      skippedVersions: log.skippedVersions,
      beforeSince: log.beforeSince,
      tornLineCharacters: log.tornLineCharacters,
    },
    measures: buildLiveUseSummary(log.records),
  };

  await mkdir(dirname(runDir), { recursive: true });
  await mkdir(runDir);
  await writeReport(join(runDir, 'summary.json'), summary);

  return { runDir, summary };
}
