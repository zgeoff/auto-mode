---
name: project-testing
description:
  "auto-mode's test facts and its own test topics beside the shared testing skill: running the
  suite, the injected host environment, the CLI, git, time, the HTTP mock of the decision API, the
  judge's stub claude, recorded inputs, and the Claude Code mod checks. Load it beside testing
  before you design, write or review an auto-mode test."
metadata:
  kind: rule-set
---

# auto-mode testing

## Facts

| Fact       | Where                                                                                                                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lanes      | [`rig.config.ts`](../../../rig.config.ts), which declares none                                                                                                                                           |
| Test utils | [`test-utils/`](../../../test-utils/); [`mods/auto-mode/hooks/test-utils/`](../../../mods/auto-mode/hooks/test-utils/) for the mod checks; [`evals/lib/`](../../../evals/lib/) for the evaluation suites |

## Departures

None.

## Running the suite

- Run `bun run test`. It builds `dist/`, which the `e2e/` tests spawn, and then runs every test
  through `rig unit`, the `@zgeoff/rig` test runner. `bun run test:related <files>` builds `dist/`
  too, then runs the tests beside the files you name through `rig related`.
- Keep `--no-env-file` and `--conditions=auto-mode-eval` in the `BUN_OPTIONS` variable that the
  `test` and `test:related` scripts in [`package.json`](../../../package.json) set. `rig related`
  passes no flags on to `bun test`, and Bun reads `BUN_OPTIONS` in every process that rig starts.
- Pass both flags to a bare `bun test`, such as
  `bun --no-env-file test --conditions=auto-mode-eval evals/<path>`. Without `--no-env-file`, Bun
  loads your `.env`, and a test sees your real API key. Without the condition, the `evals` package's
  `auto-mode` import resolves to `dist/`, and its `auto-mode/eval` import doesn't resolve.
- Pass a `Bun.spawn` or `Bun.$` child an explicit `env` that holds only what it needs, such as
  `PATH` and a `HOME` in the temp folder. The preload, [`test-setup.ts`](../../../test-setup.ts),
  deletes the `GIT_*` variables a git hook exports and the `AUTO_MODE_SCOPE_FILE` that a session
  launcher exports, but only from `process.env`. A Bun child still gets the environment Bun started
  with.

## The host environment

Only the entry points, such as `cli.ts`, read `process.env`, `homedir()` and the scratch paths. The
scratch paths are the folders every task may write. Every function below them takes a
[`HostEnvironment`](../../../src/config/types.ts): `{ env, home, scratchPaths? }`.

- Build one with
  [`buildMockHostEnvironment`](../../../test-utils/factories/build-mock-host-environment.ts). Its
  `env` is empty and its `home` doesn't exist, so pass the test's temp folder as `home`, and name
  each variable the case needs in `env`.
- When your test expects a write under `/tmp` to be denied as outside the task's scope, pass
  `scratchPaths: []`. A `HostEnvironment` without `scratchPaths` gets `/tmp` and the `/dev` streams,
  and the scope check finds no out-of-scope write there. With or without `scratchPaths`, the scope
  check flags a credential path under `home`, such as `.ssh`.
- Root every cwd in a git repository that the test creates in its temp tree. The scope and
  repository readers walk up from the cwd to the nearest `.git`, so a stray `.git` above the system
  temp folder becomes the repository they read.

## The CLI

- Run the CLI in-process through [`runCLI`](../../../src/run-cli.ts), as
  [`run-cli.test.ts`](../../../src/run-cli.test.ts) does. Pass
  [`buildStubOutput`](../../../test-utils/build-stub-output.ts) for stdout and stderr, and read what
  the CLI wrote with its `read()`. Pass
  [`buildStubStopSignals`](../../../test-utils/build-stub-stop-signals.ts) for SIGTERM and SIGINT;
  its `stop()` calls each callback still subscribed.
- To test the built CLI, spawn `dist/cli.js` under node 24 with an `env` that holds `PATH`, plus
  `HOME` and the XDG folders set to the temp folder, as the `cli-*.test.ts` files in
  [`e2e/`](../../../e2e/) do. Run `bun run build` before a bare `bun test e2e/<file>`, or it runs
  the old build.
- In the test, run `node -p process.execPath` with the test's own `process.env`, and spawn the node
  binary at the path it prints. Never spawn the `node` on `PATH`: a version manager's `node` shim
  needs your real `HOME`, which the child doesn't get.
- To send a stop signal to a spawned CLI, copy [`cli.test.ts`](../../../src/cli.test.ts). Set the
  API key command in the CLI's config to
  [`run-stub-key-helper.ts`](../../../test-utils/run-stub-key-helper.ts). The CLI then blocks on the
  helper and sends no request. Send the signal once the helper connects to the socket path that the
  test passes it.

## Git

- Run git through [`runGit`](../../../test-utils/run-git.ts). It gives git only `PATH`, a `HOME` in
  the temp folder, no global or system config and a fixed identity, so a pre-push hook's `GIT_DIR`
  and your signing config never reach it.
- Pass [`run-stub-gh.ts`](../../../test-utils/run-stub-gh.ts) to
  [`readPullRequest`](../../../src/scope/read-pull-request.ts) as its gh command, as
  `read-pull-request.test.ts` does. Give the stub, as its first argument, a JSON file of the pull
  requests that `gh pr view` returns.

## Time

- Pass `now` and `timeout` through the `runtime` field of the
  [`EvaluationOptions`](../../../src/config/types.ts) that `classifyAction` and `classifyWithJudge`
  take. Each builds its deadlines from them. Build the runtime with
  [`buildMockRuntime`](../../../test-utils/factories/build-mock-runtime.ts).
- When you call the decision client or a judge session directly, pass an `AbortSignal`, such as
  `AbortSignal.timeout(10_000)`. Each takes its deadline only from that signal.
- Pass [`buildStubLockClock`](../../../test-utils/build-stub-lock-clock.ts) as the `LockClock` that
  [`updateJSONFile`](../../../src/state/update-json-file.ts) and the state writers take. With
  `advancesOnWait`, its `now()` moves forward by each delay passed to `wait()`.
- To check that the API key reader stops its command and the command's child on cancellation or at
  the deadline, use `run-stub-key-helper.ts` as the command, as
  [`read-api-key-from-command.test.ts`](../../../src/config/read-api-key-from-command.test.ts) does.
  It reports its own process ID and its child's. Read each process's state with
  [`loadProcessState`](../../../test-utils/load-process-state.ts), which reads `/proc` and so runs
  on Linux only.

## HTTP

[`handlers.ts`](../../../mocks/handlers.ts) answers `DECISION_URL`, the decision API that a provider
with `protocol: 'system-one'` calls. The provider that `buildMockProviderConfig` returns already
points there.

- Seed a decision answer in [`decisionAnswers`](../../../mocks/decision-answers.ts), keyed by
  question ID, such as `rule_0`. A question with no seeded answer gets `allow` at confidence 1. The
  preload clears every seeded answer after each test.
- Assert the exact request body in the decision client's own tests. The mock decision API rejects a
  request only where the real API does. It never checks what a non-null `state` holds, or any field
  of a question except `type`.
- Build a `system-one` provider at the mock decision host with
  [`buildMockProviderConfig`](../../../test-utils/factories/build-mock-provider-config.ts).
- To capture a request, pass `server.use` a handler that records the request and returns nothing.
  Use the MSW server in [`mocks/node.ts`](../../../mocks/node.ts). Read the body from
  `request.clone()`, so the default handler can still read it.
- In a capture test, also assert the answer the default handler gives. A handler that returns
  nothing hands the request on. If no later handler answers, MSW sends the request to the real
  network, and the test still passes.
- To give a provider an API key, set `AUTO_MODE_UNSET_TEST_KEY` to any invented string in the test's
  host `env`. The factories name that variable as the key's source, and no real environment sets it.

## The judge

Every judge review runs in a `claude` process that the Agent SDK starts, and MSW can't reach a
spawned process. Stand in for `claude` with
[`run-stub-claude.ts`](../../../test-utils/run-stub-claude.ts).

- Copy the `setupTest` of
  [`start-judge-session.test.ts`](../../../src/judge/start-judge-session.test.ts) into your test
  file. It writes a `claude` shell script that runs the stub with `process.execPath`, into a `bin`
  folder of the test's temp tree.
- Pass only that `bin` folder as `PATH`: in the `env` you give `startJudgeSession`, or in the `env`
  you give `buildMockRuntime` for `classifyWithJudge`.
- Set the stub's reply with the `STUB_CLAUDE_*` variables that `run-stub-claude.ts` reads. Put them
  in the same `env` as `PATH`.
- To check what a review sent, set `STUB_CLAUDE_RECORD` to a file in the temp tree. Read that file
  with [`readStubClaudeRecords`](../../../test-utils/read-stub-claude-records.ts), which returns one
  record per review. Search `run-stub-claude.ts` for `appendFileSync` to see each field a record
  holds.

## Recorded inputs

- Read a mod request recorded in a live Claude Code session, a `mod-request-*.json` file in
  [`fixtures/`](../../../fixtures/), with [`readFixture`](../../../test-utils/read-fixture.ts).
- Never run an evaluation runner in a test. The `run-*-evaluation.ts` runners in
  [`evals/runners/`](../../../evals/runners/) send real model requests. The replay suites read the
  recorded answers in the `recorded/` folder of [`evals/corpora/`](../../../evals/corpora/).

## The Claude Code mod checks

- Run the checks in `mods/auto-mode/hooks/` with `bun run check:claude-mod`, with `claude` on your
  `PATH`. [`check-claude-mod.ts`](../../../scripts/check-claude-mod.ts) runs them as the shared
  testing skill's [mod checks reference](../testing/references/claude-code-mods.md) says.
- Add a declaration to the `claude-code/testing` module in
  [`testing.d.ts`](../../../mods/auto-mode/hooks/testing.d.ts) only after you find it in the Claude
  Code test runner's own declarations, as that reference says.
- Keep each hook handler's answer valid. The host rejects a `tool.call` answer that carries `deny`
  beside `result`, and an `agent.spawn` answer without `model` beside `agentId`.

Leave the mod branches below without a check, and name each one in a comment, because the Claude
Code test runner never lets a check reach them:

- Skip the "subprocess timeout" branch. The runner reports a hook that throws as skipped, so the mod
  never sees the error.
- Skip the branch for a tool call without a `tool_use_id`, the field the mod copies into its
  request's `toolUseID`. The runner adds one to every tool call.
- Skip the "cancelled" and "insufficient budget" branches. The runner gives every hook a
  `next.budget.remainingMs` of 10000 and a signal that never aborts.
- Skip a child agent's evaluation, and the evaluation of a main-agent call that carries a
  `toolUseID`. Each starts as a `tool.check` inside a `tool.call` handler, and the runner delivers
  such a check only after that call ends.
