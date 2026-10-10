import { join } from 'node:path';
import { buildTaskScope, checkContainment } from 'auto-mode';
import type { ContainmentDeny } from 'auto-mode';
import { pickScopeSourceReader, updateSessionScope } from 'auto-mode/eval';
import { buildStubCheckoutFinder } from '../../test-utils/build-stub-checkout-finder.ts';
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

// Replays the recorded sessions in order: each call records what it made in its
// session's scope file, and each corpus action is checked against its cwd, that
// file, and the atc record `<atcRecordDir>/<session>.json` when one exists.
export async function runSessionScopeReplay(
  replay: Readonly<SessionScopeReplay>,
): Promise<Map<string, ContainmentDeny | null>> {
  const cases = new Map(replay.cases.map((entry) => [entry.id, entry]));
  const denies = new Map<string, ContainmentDeny | null>();

  for (const session of replay.recording.sessions) {
    for (const entry of session.entries) {
      if ('case' in entry) {
        const action = cases.get(entry.case);

        if (action === undefined) {
          throw new Error(`The recording names a case the corpus lacks: ${entry.case}`);
        }

        const deny = await checkSessionContainment(replay, session.name, action);

        denies.set(entry.case, deny);
      } else if (entry.succeeded) {
        await updateSessionScope(
          {
            sessionID: session.name,
            cwd: entry.cwd,
            startedAt: 0,
            command: entry.command,
            resultText: entry.resultText,
          },
          {
            now: 0,
            stateDir: replay.stateDir,
            home: replay.recording.home,
            env: {},
            readPullRequest: () => Promise.resolve(null),
            verifyEvent: (event, request) =>
              Promise.resolve(
                buildStubSessionScope(event, request.resultText, {
                  commonDir: COMMON_DIR,
                  worktreeBranches: replay.recording.worktreeBranches,
                  pullRequestHeads: replay.recording.pullRequestHeads,
                }),
              ),
          },
        );
      }
    }
  }

  return denies;
}

async function checkSessionContainment(
  replay: Readonly<SessionScopeReplay>,
  sessionName: string,
  action: Readonly<DecisionRulesCase>,
): Promise<ContainmentDeny | null> {
  const context = {
    env: {},
    sessionID: sessionName,
    cwd: action.cwd,
    worktree: action.cwd,
    commonDir: COMMON_DIR,
    branch: action.repository.branch,
    stateDir: replay.stateDir,
    atcRecordPath: join(replay.atcRecordDir, `${sessionName}.json`),
    atcSessionID: sessionName,

    // The atc source writes a diagnostic only for a malformed record, and the
    // recorded atc records are well formed.
    stderr: { write: () => true },
  };

  const facts = await Promise.all([
    pickScopeSourceReader({ kind: 'cwd' })(context),
    pickScopeSourceReader({ kind: 'session' })(context),

    // A recording holds no checkout on disk; every recorded checkout is in the
    // action's repository.
    pickScopeSourceReader(
      { kind: 'atc' },
      buildStubCheckoutFinder({}, COMMON_DIR).findCheckout,
    )(context),
  ]);

  const scope = buildTaskScope({
    home: replay.recording.home,
    currentBranch: action.repository.branch,
    defaultBranch: action.repository.defaultBranch,
    remotes: replay.recording.remotes,
    facts,
  });

  return checkContainment(
    { sessionID: sessionName, cwd: action.cwd, toolName: action.tool, toolInput: action.input },
    scope,
  );
}
