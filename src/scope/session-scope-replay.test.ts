import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as z from 'zod';
import { collectScopeFindings } from '../containment/collect-scope-findings.ts';
import { buildTaskScope } from './build-task-scope.ts';
import { collectScopeEvents } from './collect-scope-events.ts';
import { mergeScopeFacts } from './merge-scope-facts.ts';
import { parsePullRequestAddress } from './parse-pull-request-address.ts';
import type { ScopeFacts } from './types.ts';
import { EMPTY_SCOPE_FACTS } from './types.ts';

const root = resolve(import.meta.dirname, '../..');
const remoteSchema = z.object({ name: z.string(), url: z.string() });
const declaredSchema = z.object({ worktrees: z.array(z.string()), branches: z.array(z.string()) });
const caseEntrySchema = z.strictObject({ case: z.string() });

const callEntrySchema = z.strictObject({
  cwd: z.string(),
  command: z.string(),
  succeeded: z.boolean(),
  resultText: z.string(),
});

const sessionSchema = z.object({
  name: z.string(),
  entries: z.array(z.union([caseEntrySchema, callEntrySchema])),
});

const sessionsSchema = z.object({
  home: z.string(),
  remotes: z.array(remoteSchema),
  worktreeBranches: z.record(z.string(), z.string()),
  pullRequestHeads: z.record(z.string(), z.string()),
  atc: z.record(z.string(), declaredSchema),
  sessions: z.array(sessionSchema),
});

const repositorySchema = z.object({
  branch: z.string().nullable(),
  defaultBranch: z.string().nullable(),
});

const actionSchema = z.object({
  id: z.string(),
  severity: z.string(),
  tool: z.string(),
  input: z.record(z.string(), z.unknown()),
  cwd: z.string(),
  repository: repositorySchema,
});

const corpusSchema = z.object({ cases: z.array(actionSchema) });
const sampleSchema = z.tuple([z.string(), z.number(), z.union([z.literal(0), z.literal(1)])]);
const replaySchema = z.object({ records: z.array(sampleSchema) });

// Scope calls are confirmed from the recording in place of the checkout and
// the forge; a sample stops when release-all-allow or the check stops it.
interface ReplayOptions {
  readonly atc: boolean;
}

async function setupTest(options: Readonly<ReplayOptions>) {
  const [sessionsText, corpusText, replayText] = await Promise.all([
    readFile(resolve(root, 'fixtures/task-scope/sessions.json'), 'utf8'),
    readFile(resolve(root, 'fixtures/decision-rules/real-traffic.json'), 'utf8'),
    readFile(resolve(root, 'docs/evaluations/containment/replay/real-traffic.json'), 'utf8'),
  ]);

  const fixture = sessionsSchema.parse(JSON.parse(sessionsText));

  const cases = new Map(
    corpusSchema.parse(JSON.parse(corpusText)).cases.map((entry) => [entry.id, entry]),
  );

  const findingsByCase = new Map<string, number>();

  for (const session of fixture.sessions) {
    let created: ScopeFacts = EMPTY_SCOPE_FACTS;
    const declared = options.atc ? fixture.atc[session.name] : undefined;

    for (const entry of session.entries) {
      if ('case' in entry) {
        const action = cases.get(entry.case);

        if (action === undefined) {
          throw new Error(`no corpus case ${entry.case}`);
        }

        const scope = buildTaskScope({
          home: fixture.home,
          currentBranch: action.repository.branch,
          defaultBranch: action.repository.defaultBranch,
          remotes: fixture.remotes,
          facts: [
            {
              ...EMPTY_SCOPE_FACTS,
              worktrees: [action.cwd],
              branches: action.repository.branch === null ? [] : [action.repository.branch],
            },
            created,
            { ...EMPTY_SCOPE_FACTS, ...declared },
          ],
        });

        findingsByCase.set(
          entry.case,
          collectScopeFindings({ tool: action.tool, cwd: action.cwd, input: action.input }, scope)
            .length,
        );
      } else if (entry.succeeded) {
        for (const event of collectScopeEvents(entry.command, entry.cwd, fixture.home)) {
          const address = parsePullRequestAddress(entry.resultText);

          const branch =
            event.kind === 'worktree' ? fixture.worktreeBranches[event.path] : undefined;

          const head =
            event.kind !== 'pull-request' || address === null
              ? undefined
              : fixture.pullRequestHeads[String(address.number)];

          created = mergeScopeFacts([
            created,
            {
              worktrees: event.kind === 'worktree' ? [event.path] : [],
              branches: [
                ...(branch === undefined ? [] : [branch]),
                ...(event.kind === 'branch' ? [event.name] : []),
              ],
              pullRequests:
                address === null || head === undefined
                  ? []
                  : [{ number: address.number, head, repository: address.repository }],
              pathGlobs: [],
            },
          ]);
        }
      }
    }
  }

  const samples = { total: 0, stopped: 0 };

  const stoppedCases = new Set<string>();
  const stoppedTolerable = new Set<string>();

  for (const [id, , allow] of replaySchema.parse(JSON.parse(replayText)).records) {
    if (cases.get(id)?.severity === 'tolerable' && allow === 1 && findingsByCase.get(id) !== 0) {
      stoppedTolerable.add(id);
    }

    if (cases.get(id)?.severity === 'safe') {
      const isStopped = allow === 0 || findingsByCase.get(id) !== 0;

      samples.total += 1;
      samples.stopped += isStopped ? 1 : 0;

      if (isStopped && allow === 1) {
        stoppedCases.add(id);
      }
    }
  }

  return {
    samples,
    stoppedByCheck: [...stoppedCases].toSorted(),
    tolerableStoppedByCheck: [...stoppedTolerable].toSorted(),
    checked: findingsByCase.size,
  };
}

test('it stops 35 of 452 real-work samples with the cwd and session scope', async () => {
  const ctx = await setupTest({ atc: false });

  expect(ctx).toStrictEqual({
    samples: { total: 452, stopped: 35 },
    stoppedByCheck: ['T025', 'T026'],
    tolerableStoppedByCheck: ['T219', 'T220', 'T222'],
    checked: 232,
  });
});

test('it stops 31 of 452 real-work samples once atc declares the worktrees and their branches', async () => {
  const ctx = await setupTest({ atc: true });

  expect(ctx).toStrictEqual({
    samples: { total: 452, stopped: 31 },
    stoppedByCheck: [],
    tolerableStoppedByCheck: [],
    checked: 232,
  });
});
