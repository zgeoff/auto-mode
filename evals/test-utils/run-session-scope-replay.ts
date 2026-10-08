import { join } from 'node:path';
import type { ContainmentDeny } from '../../src/containment/check-containment.ts';
import { checkContainment } from '../../src/containment/check-containment.ts';
import { buildAtcScopeFacts } from '../../src/scope/build-atc-scope-facts.ts';
import { buildTaskScope } from '../../src/scope/build-task-scope.ts';
import { collectScopeEvents } from '../../src/scope/collect-scope-events.ts';
import { loadAtcSessionRecord } from '../../src/scope/load-atc-session-record.ts';
import { pickScopeSourceReader } from '../../src/scope/pick-scope-source-reader.ts';
import { resolveSessionScopePath } from '../../src/scope/resolve-session-scope-path.ts';
import type { ScopeFacts } from '../../src/scope/types.ts';
import { EMPTY_SCOPE_FACTS } from '../../src/scope/types.ts';
import { writeSessionScope } from '../../src/scope/write-session-scope.ts';
import { buildStubSessionScope } from './build-stub-session-scope.ts';
import type { TaskScopeSessions } from './corpora/task-scope-sessions-schema.ts';
import type { DecisionRulesCase } from './load-decision-rules-cases.ts';

export interface SessionScopeReplay {
  readonly recording: TaskScopeSessions;
  readonly cases: readonly DecisionRulesCase[];
  readonly stateDir: string;
  readonly atcRecordDir: string;
}

// Every recorded checkout shares one repository.
const COMMON_DIR = '/replay/repository.git';

// Replays the recorded sessions in order: a call records what it made in the
// session's scope file, and each corpus action is checked against its cwd, that
// file, and the atc record `<atcRecordDir>/<session>.json` when one exists.
export async function runSessionScopeReplay(
  replay: Readonly<SessionScopeReplay>,
): Promise<Map<string, ContainmentDeny | null>> {
  const cases = new Map(replay.cases.map((entry) => [entry.id, entry]));
  const denies = new Map<string, ContainmentDeny | null>();

  for (const session of replay.recording.sessions) {
    const declared = await loadDeclaredFacts(replay.atcRecordDir, session.name);

    for (const entry of session.entries) {
      if ('case' in entry) {
        const action = cases.get(entry.case);

        if (action === undefined) {
          throw new Error(`The recording names a case the corpus lacks: ${entry.case}`);
        }

        const deny = await checkSessionContainment(replay, session.name, action, declared);

        denies.set(entry.case, deny);
      } else if (entry.succeeded) {
        for (const event of collectScopeEvents(entry.command, entry.cwd, replay.recording.home)) {
          await writeSessionScope(
            resolveSessionScopePath(replay.stateDir, session.name),
            buildStubSessionScope(event, entry.resultText, {
              commonDir: COMMON_DIR,
              worktreeBranches: replay.recording.worktreeBranches,
              pullRequestHeads: replay.recording.pullRequestHeads,
            }),
          );
        }
      }
    }
  }

  return denies;
}

// The atc source confirms each named checkout's repository on disk, which a
// recording cannot; every recorded checkout is in the action's repository.
async function loadDeclaredFacts(atcRecordDir: string, sessionName: string): Promise<ScopeFacts> {
  const loaded = await loadAtcSessionRecord(join(atcRecordDir, `${sessionName}.json`), sessionName);

  return loaded.kind === 'record'
    ? buildAtcScopeFacts(loaded.record, () => true)
    : EMPTY_SCOPE_FACTS;
}

async function checkSessionContainment(
  replay: Readonly<SessionScopeReplay>,
  sessionName: string,
  action: Readonly<DecisionRulesCase>,
  declared: Readonly<ScopeFacts>,
): Promise<ContainmentDeny | null> {
  const context = {
    env: {},
    sessionID: sessionName,
    cwd: action.cwd,
    worktree: action.cwd,
    commonDir: COMMON_DIR,
    branch: action.repository.branch,
    stateDir: replay.stateDir,

    // Only the atc source writes a diagnostic, and the replay never reads through it.
    stderr: { write: () => true },
  };

  const facts = await Promise.all([
    pickScopeSourceReader({ kind: 'cwd' })(context),
    pickScopeSourceReader({ kind: 'session' })(context),
  ]);

  const scope = buildTaskScope({
    home: replay.recording.home,
    currentBranch: action.repository.branch,
    defaultBranch: action.repository.defaultBranch,
    remotes: replay.recording.remotes,
    facts: [...facts, declared],
  });

  return checkContainment(
    { sessionID: sessionName, cwd: action.cwd, toolName: action.tool, toolInput: action.input },
    scope,
  );
}
