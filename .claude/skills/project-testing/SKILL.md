---
name: project-testing
description:
  "auto-mode's test facts and its own test topics beside the shared testing skill: running the
  suite, the injected host environment, the CLI, git, clocks, the decision and Messages API mocks,
  recorded inputs, and the Claude Code mod checks. Load it beside testing before you design, write
  or review an auto-mode test."
metadata:
  kind: rule-set
---

# auto-mode testing

## Facts

| Fact       | Where                                                                                                                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lanes      | none; the mod checks run apart, under `bun run check:claude-mod`                                                                                                                                         |
| Test utils | [`test-utils/`](../../../test-utils/); [`mods/auto-mode/hooks/test-utils/`](../../../mods/auto-mode/hooks/test-utils/) for the mod checks; [`evals/lib/`](../../../evals/lib/) for the evaluation suites |

## Departures

None.

## Running the suite

- Run `bun run test`. It builds `dist/` before the tests, which the `e2e/` tests spawn.
- Pass `--conditions=auto-mode-eval` to a bare `bun test`, such as `bun test evals/…`. Without it,
  `auto-mode` resolves to `dist/`, and `auto-mode/eval` doesn't resolve.
- Pass an explicit `env` to a `Bun.spawn` or `Bun.$` child. The preload,
  [`test-setup.ts`](../../../test-setup.ts), deletes the `GIT_*` variables a git hook exports and
  the `AUTO_MODE_SCOPE_FILE` a launcher exports, but only from `process.env`. A Bun child still gets
  the environment Bun started with.

## The host environment

Only the entry points, such as `cli.ts`, read `process.env`, `homedir()` and the folders every task
may write. Every function below them takes a [`HostEnvironment`](../../../src/config/types.ts):
`{ env, home, scratchPaths? }`.

- Build one with
  [`buildMockHostEnvironment`](../../../test-utils/factories/build-mock-host-environment.ts). Its
  `env` is empty and its `home` doesn't exist, so pass the test's temp folder as `home`, and name
  each variable the case needs in `env`.
- When your test expects a write under `/tmp` to be denied as outside the task's scope, pass
  `scratchPaths: []`. By default `scratchPaths` holds `/tmp` and the `/dev` streams, and the scope
  check finds no out-of-scope write there. It still flags a credential path under `home`, such as
  `.ssh`.
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
  [`e2e/`](../../../e2e/) do. Run `bun run build` before a bare `bun test e2e/…`, or it runs the old
  build.
- Spawn the node binary that `node -p process.execPath` prints when the test runs it with your
  environment, not the `node` on `PATH`. A version manager's `node` shim needs your real `HOME`,
  which the child doesn't get.
- To send a stop signal to a spawned CLI, set the API key command in its config to
  [`run-stub-key-helper.ts`](../../../test-utils/run-stub-key-helper.ts), as
  [`cli.test.ts`](../../../src/cli.test.ts) does. The CLI then blocks on the helper and sends no
  request. Send the signal once the helper connects to the socket path that the test passes it.

## Git

- Run git through [`runGit`](../../../test-utils/run-git.ts). It gives git only `PATH`, a `HOME` in
  the temp folder, no global or system config and a fixed identity, so a pre-push hook's `GIT_DIR`
  and your signing config never reach it.
- Pass [`run-stub-gh.ts`](../../../test-utils/run-stub-gh.ts) to
  [`readPullRequest`](../../../src/scope/read-pull-request.ts) as its gh command, as
  `read-pull-request.test.ts` does. Give the stub, as its first argument, a JSON file of the pull
  requests that `gh pr view` returns.

## Time

- Pass `now` and `timeout` to the code that classifies a tool call through the `runtime` of its
  [`EvaluationOptions`](../../../src/config/types.ts), built with
  [`buildMockRuntime`](../../../test-utils/factories/build-mock-runtime.ts), and an `AbortSignal` to
  the decision and Messages clients.
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

[`handlers.ts`](../../../mocks/handlers.ts) answers two APIs: `DECISION_URL`, the decision API that
a provider with `protocol: 'system-one'` calls, and `MESSAGES_URL`, the Anthropic Messages API.

- Seed a decision answer in [`decisionAnswers`](../../../mocks/decision-answers.ts), keyed by
  question ID, such as `rule_0`. A question with no seeded answer gets `allow` at confidence 1.
- Seed a Messages reply in the [`messagesReplies`](../../../mocks/messages-replies.ts) queue. An
  empty queue answers HTTP 500.
- Assert the exact request body in the decision client's own tests. The mock decision API rejects a
  request only where the real API does, and never checks what a non-null `state` holds or any field
  of a question but `type`.
- [`buildMockProviderConfig`](../../../test-utils/factories/build-mock-provider-config.ts) returns a
  `system-one` provider at the mock decision host. For a Messages provider, override `protocol` to
  `messages` and `baseURL` to the origin of `MESSAGES_URL`.
- To capture a request, add a `server.use` handler that records it and returns nothing, and read the
  body from `request.clone()`. Also assert the answer that the default handler gives after yours. A
  handler that returns nothing hands the request on, and if no handler answers, MSW 2 sends the
  request to the real network without the preload's unhandled-request error.
- To give a provider an API key, set `AUTO_MODE_UNSET_TEST_KEY` in the test's host `env`. The
  factories name that variable as the key's source, and no real environment sets it.

## Recorded inputs

- Read a mod request recorded in a live Claude Code session, a `mod-request-*.json` file in
  [`fixtures/`](../../../fixtures/), with [`readFixture`](../../../test-utils/read-fixture.ts).
- Never run an evaluation runner in a test. The `run-*-evaluation.ts` runners in
  [`evals/runners/`](../../../evals/runners/) send real model requests. The replay suites read the
  recorded answers in [`evals/corpora/`](../../../evals/corpora/)'s `recorded/` folder.

## The Claude Code mod checks

- Run the checks in `mods/auto-mode/hooks/` with `bun run check:claude-mod`, with `claude` on your
  `PATH`. [`check-claude-mod.ts`](../../../scripts/check-claude-mod.ts) runs them as the shared
  testing skill's Claude Code mod checks reference says.
- Add a declaration to the `claude-code/testing` module in
  [`testing.d.ts`](../../../mods/auto-mode/hooks/testing.d.ts) only after you find it in the Claude
  Code test runner's own declarations, as the shared Claude Code mod checks reference says.
- Keep each handler's answer valid. The host rejects a `tool.call` answer that carries `deny` beside
  `result`, and an `agent.spawn` answer without `model` beside `agentId`.

Leave the mod branches below without a check, and name each one in a comment, because the Claude
Code test runner never lets a check reach them:

- Skip the "subprocess timeout" branch. The runner reports a hook that throws as skipped, so the mod
  never sees the error.
- Skip the branch for a tool call without a `tool_use_id`. The runner adds one to every tool call.
- Skip the "cancelled" and "insufficient budget" branches. The runner gives every hook a
  `next.budget.remainingMs` of 10000 and a signal that never aborts.
- Skip a child agent's evaluation and the evaluation of a main-agent call that carries a
  `toolUseID`. The runner delivers a `tool.check` started inside a `tool.call` handler only after
  that call ends.
