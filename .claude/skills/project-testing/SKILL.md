---
name: project-testing
description:
  auto-mode's test harness facts on top of the shared testing skill — the preload, the injected host
  environment and clocks, git in tests, the default decision and Messages mocks, and the Claude Code
  mod checks. Extends the shared testing skill and must be loaded together with it when designing,
  writing, or reviewing auto-mode tests.
---

# auto-mode testing

The shared testing skill holds every rule. This skill holds only the facts of auto-mode's own
harness that a test author needs to follow those rules here.

## Running

- `bun run test` builds `dist/` and then runs the suite (`bun --no-env-file test`): one process,
  files in sequence. The `--no-env-file` flag keeps a local `.env` out of the run.
- `bunfig.toml` preloads `@zgeoff/bun-test-extended` (the jest-extended matchers) and
  `test-setup.ts`.
- `test-setup.ts` seeds faker with a fixed value, starts the MSW server with
  `onUnhandledRequest: 'error'`, and after each test resets the handlers and clears both reply
  stores.
- `test-setup.ts` also deletes the `GIT_*` names a git hook exports and the `ATC_*` names an atc
  session exports. The deletion reaches in-process reads and `node:child_process` children only: a
  `Bun.spawn` or `Bun.$` child gets the environment bun started with.

## The host environment

Production never reads `process.env`, `homedir()` or the scratch locations below its entry points.
They arrive as a `HostEnvironment` (`src/config/types.ts`): `{ env, home, scratchPaths? }`.

- `cli.ts` reads the real host once with `readHostEnvironment()` and passes it down. A test passes
  its own `{ env: {}, home: <temp dir> }` instead.
- `scratchPaths` lists the locations every task may write (`/tmp` and the `/dev` streams by
  default). The containment check never denies a write there, so a test whose temp tree sits under
  `/tmp` and expects a containment deny passes `scratchPaths: []`.
- The scope and repository readers walk up from a cwd to the nearest `.git`. A test roots every cwd
  in a repository it creates inside its temp tree, so the walk never leaves it. A stray `.git` above
  the system temp directory otherwise becomes the task's worktree.

## The CLI

- `src/run-cli.ts` holds the CLI as `runCLI(argv, io)`: `io` carries `stdin` (a function that
  returns the body), `stdout`, `stderr`, the `host` and `subscribeToStopSignals`, and the result is
  the exit code. A `--jev-only` run subscribes for the length of its evaluation and unsubscribes
  after it. `src/cli.ts` only wires the real process into it, and its subscription listens for
  SIGTERM and SIGINT.
- `src/run-cli.test.ts` runs `runCLI` in-process. `buildStubOutput` from
  `test-utils/build-stub-output.ts` stands in for stdout and stderr, and its `read()` returns what
  was written. `buildStubStopSignals` from `test-utils/build-stub-stop-signals.ts` stands in for the
  signals: its `stop()` calls every callback still subscribed.
- `e2e/cli.test.ts` spawns the built `dist/cli.js` under node with a minimal environment rooted in
  the temp dir. It fails at once when `dist/cli.js` is missing. Only `bun run test` rebuilds
  `dist/`, so a bare `bun test e2e/…` runs whatever `dist/` already holds. The child runs the binary
  that `node -p process.execPath` resolves, because a version manager's node shim needs the user's
  HOME.

## Git

- Run git through `runGit(dir, args)` from `test-utils/run-git.ts`. It gives the child a minimal
  environment: `PATH`, `HOME` set to the temp dir, no global or system config, and a fixed identity.
  A pre-push hook's `GIT_DIR` and the host's signing or template config cannot reach it.

## Time

- The evaluation path takes `now` and `timeout` in `EvaluationOptions`; the defaults are `Date.now`
  and `AbortSignal.timeout`. The decision and Messages clients take a required `signal`.
- `writeSessionScope` takes a `LockClock` (`{ now, wait }`). `buildStubLockClock` from
  `test-utils/build-stub-lock-clock.ts` gives one that advances on each wait.
- The key-command reader stops its helper on the injected timer; `test-utils/run-stub-key-helper.ts`
  is a helper script that starts a child and reports both process IDs, and
  `test-utils/load-process-state.ts` reads a process's state from `/proc` (Linux only).

## HTTP

- `mocks/handlers.ts` answers `DECISION_URL` (the Jev decision API) and `MESSAGES_URL` (the
  Anthropic Messages API). `buildMockProviderConfig` points at the decision host by default; a
  Messages provider overrides `protocol` and `baseURL`.
- The decision handler answers from `decisionAnswers` (`mocks/decision-answers.ts`), a Map keyed by
  question ID such as `rule_0` or `hard_deny_0`. A question with no seeded answer gets a certain
  allow.
- The Messages handler answers from the `messagesReplies` queue (`mocks/messages-replies.ts`). An
  empty queue answers HTTP 500 with an `api_error` body.
- A per-test `server.use` handler that records the request and returns nothing passes it on to the
  default handler. Read the body from `request.clone()`, because the default handler reads it too.
  When no later handler answers, MSW 2 sends the request to the real network instead of raising
  `onUnhandledRequest`, so a capture test also asserts the outcome the default handler produced.
- Provider keys come from the injected host's `env`. The factories name the key variable
  `AUTO_MODE_UNSET_TEST_KEY`, which no test environment sets, so a test that needs a key puts it in
  its host.

## Recorded inputs

- `fixtures/mod-request-*.json` are mod requests recorded in a live Claude Code session; read one
  with `readFixture` from `test-utils/read-fixture.ts`.
- `fixtures/` also holds the evaluation corpora and `docs/evaluations/` their reports. The
  `scripts/run-*-evaluation.ts` runners send real model requests, so no test runs one.

## The Claude Code mod checks

- `mods/auto-mode/hooks/*.claude-check.ts` run under `claude plugin test` through
  `bun run check:claude-mod`, not under `bun test`. The script copies `hooks/` into a temp dir,
  renames each `*.claude-check.ts` to `*.test.ts`, and runs `claude plugin validate` and
  `claude plugin test` under `env -i` with an isolated config dir. It needs `claude` on `PATH`.
- They import `expect` and `test` from `claude-code/testing`, declared in
  `mods/auto-mode/hooks/testing.d.ts`. That module has no `test.each`, no `mock()` recorder, no
  `onTestFinished`, no setup hooks and no jest-extended matchers; `mock.clock`, `mock.store` and
  `mock.env` exist. Each test gets a fresh host.
- The checks load only the mod's own files, so their factories, the process-run stub and
  `assertDefined` live in `mods/auto-mode/hooks/test-utils/`, each with its own checks.
- The host reports a hook that throws as skipped and raises its own error, so the mod never sees the
  thrown text. A check cannot reach the mod's "subprocess timeout" branch.
