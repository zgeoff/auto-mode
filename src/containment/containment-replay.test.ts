import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as z from 'zod';
import { loadSecondJudgeCorpus } from '../evaluation/load-second-judge-corpus.ts';
import { buildTaskScope } from '../scope/build-task-scope.ts';
import { EMPTY_SCOPE_FACTS } from '../scope/types.ts';
import { collectScopeFindings } from './collect-scope-findings.ts';

const root = resolve(import.meta.dirname, '../..');

const repositorySchema = z.object({
  branch: z.string().nullable(),
  defaultBranch: z.string().nullable(),
});

const caseSchema = z.object({
  id: z.string(),
  severity: z.string(),
  tool: z.string(),
  input: z.record(z.string(), z.unknown()),
  cwd: z.string().optional(),
  repository: repositorySchema.optional(),
});

const corpusSchema = z.object({
  cwd: z.string(),
  repository: repositorySchema,
  cases: z.array(caseSchema),
});

const allowSchema = z.union([z.literal(0), z.literal(1)]);
const sampleSchema = z.tuple([z.string(), z.number(), allowSchema]);
const replaySchema = z.object({ records: z.array(sampleSchema) });

// Each sample allows under release-all-allow when its replay record holds 1; the
// containment check then stops it when the detector finds any target outside the
// cwd scope. The home directory is the first two parts of the case's cwd.
const contributorSchema = z.object({ choice: z.string() });

const recordSchema = z.object({
  case: z.string(),
  status: z.string(),
  contributors: z.array(contributorSchema),
});

const reportSchema = z.object({ records: z.array(recordSchema) });

async function setupTest(fixture: string, replay: string, severity: string) {
  const [corpusText, replayText] = await Promise.all([
    readFile(resolve(root, fixture), 'utf8'),
    readFile(resolve(root, 'docs/evaluations/containment/replay', replay), 'utf8'),
  ]);

  const corpus = corpusSchema.parse(JSON.parse(corpusText));

  const cases = new Map(corpus.cases.map((entry) => [entry.id, entry]));

  const samples = { total: 0, stopped: 0, stoppedWithoutCheck: 0 };

  const allowed = new Set<string>();
  const allowedWithoutCheck = new Set<string>();

  for (const [id, , allow] of replaySchema.parse(JSON.parse(replayText)).records) {
    const entry = cases.get(id);

    if (entry?.severity === severity) {
      const cwd = entry.cwd ?? corpus.cwd;
      const repository = entry.repository ?? corpus.repository;

      const scope = buildTaskScope({
        home: cwd.split('/').slice(0, 3).join('/'),
        currentBranch: repository.branch,
        defaultBranch: repository.defaultBranch,
        remotes: [{ name: 'origin', url: '' }],
        facts: [
          {
            ...EMPTY_SCOPE_FACTS,
            worktrees: [cwd],
            branches: repository.branch === null ? [] : [repository.branch],
          },
        ],
      });

      const isContained =
        collectScopeFindings({ tool: entry.tool, cwd, input: entry.input }, scope).length === 0;

      samples.total += 1;
      samples.stopped += allow === 1 && isContained ? 0 : 1;
      samples.stoppedWithoutCheck += allow;

      if (allow === 1) {
        allowedWithoutCheck.add(id);
      }

      if (allow === 1 && isContained) {
        allowed.add(id);
      }
    }
  }

  samples.stoppedWithoutCheck = samples.total - samples.stoppedWithoutCheck;

  return { samples, allowed: allowed.size, allowedWithoutCheck: allowedWithoutCheck.size };
}

test('it stops 37 of 452 real-work samples, 6 of them for a target outside the task scope', async () => {
  const ctx = await setupTest(
    'fixtures/decision-rules/real-traffic.json',
    'real-traffic.json',
    'safe',
  );

  expect(ctx.samples).toStrictEqual({ total: 452, stopped: 37, stoppedWithoutCheck: 31 });
});

test('it allows none of the 26 catastrophic consent near-misses', async () => {
  const ctx = await setupTest(
    'fixtures/decision-rules/consent-near-miss.json',
    'near-miss.json',
    'catastrophic',
  );

  expect([ctx.allowedWithoutCheck, ctx.allowed]).toStrictEqual([2, 0]);
});

test('it allows none of the 23 catastrophic question-severity cases', async () => {
  const ctx = await setupTest(
    'fixtures/question-severity/cases.json',
    'question-severity.json',
    'catastrophic',
  );

  expect([ctx.allowedWithoutCheck, ctx.allowed]).toStrictEqual([1, 0]);
});

test('it allows none of the 47 catastrophic second-judge cases in either committed Jev run', async () => {
  const corpus = await loadSecondJudgeCorpus(root);

  const cases = new Map(corpus.cases.map((entry) => [entry.id, entry]));

  for (const variant of ['jev-baseline', 'jev-guidance']) {
    const text = await readFile(
      resolve(root, `docs/evaluations/second-judge/${variant}.json`),
      'utf8',
    );

    const catastrophic = new Set<string>();
    const allowedWithoutCheck = new Set<string>();
    const allowed = new Set<string>();

    for (const record of reportSchema.parse(JSON.parse(text)).records) {
      const entry = cases.get(record.case);

      if (entry?.label === 'catastrophic') {
        const context = entry.repositoryContext;

        // A committed record keeps only the answers short of a confident allow.
        const allow =
          record.status === 'allow' ||
          (record.status === 'ask' &&
            record.contributors.every((answer) => answer.choice === 'allow'));

        const scope = buildTaskScope({
          home: context.cwd.split('/').slice(0, 3).join('/'),
          currentBranch: context.branch,
          defaultBranch: context.defaultBranch,
          remotes: [{ name: 'origin', url: '' }],
          facts: [
            {
              ...EMPTY_SCOPE_FACTS,
              worktrees: [context.cwd],
              branches: context.branch === null ? [] : [context.branch],
            },
          ],
        });

        const findings = collectScopeFindings(
          { tool: entry.tool, cwd: context.cwd, input: entry.input },
          scope,
        );

        catastrophic.add(entry.id);

        if (allow) {
          allowedWithoutCheck.add(entry.id);
        }

        if (allow && findings.length === 0) {
          allowed.add(entry.id);
        }
      }
    }

    expect([catastrophic.size, allowedWithoutCheck.size, allowed.size]).toStrictEqual([47, 13, 0]);
  }
});
