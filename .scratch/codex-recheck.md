OpenAI Codex v0.160.1
--------

workdir: /root/.local/share/atc/workspaces/auto-mode-main/.worktrees/geo-771 model: gpt-6.1-sol
provider: openai approval: never sandbox: read-only reasoning effort: none reasoning summaries: none
session id: 01a13c07-476f-7ca2-a3b3-33c6cc7cde3c
--------

user changes against 'main' warning: Codex could not find bubblewrap on PATH. Install bubblewrap
with your OS package manager. See the sandbox prerequisites:
https://developers.openai.com/codex/concepts/sandboxing#prerequisites. Codex will use the bundled
bubblewrap in the meantime. 2026-10-14T20:07:53.010517Z ERROR
codex_api::endpoint::responses_websocket: failed to connect to websocket: HTTP error: 426 Upgrade
Required, url: wss://chatgpt.com/backend-api/codex/responses 2026-10-14T20:07:53.032050Z ERROR
codex_api::endpoint::responses_websocket: failed to connect to websocket: HTTP error: 426 Upgrade
Required, url: wss://chatgpt.com/backend-api/codex/responses 2026-10-14T20:07:53.188936Z ERROR
rmcp::transport::worker: worker quit with fatal: Transport channel closed, when
AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer
resource_metadata=\"https://codex-app.tldraw.xyz/.well-known/oauth-protected-resource/mcp\",
scope=\"openid profile email offline_access\"" }) 2026-10-14T20:07:53.399546Z ERROR
rmcp::transport::worker: worker quit with fatal: Transport channel closed, when
AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer
resource_metadata=\"https://sprites.dev/.well-known/oauth-protected-resource/mcp\",
scope=\"sprites:read sprites:write\"" }) 2026-10-14T20:07:53.453764Z ERROR rmcp::transport::worker:
worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError {
www_authenticate_header: "Bearer error=\"invalid_token\", error_description=\"No authorization
provided\", resource_metadata=\"https://mcp.neon.tech/.well-known/oauth-protected-resource/mcp\"" })
exec /bin/bash -lc 'git diff 5c2f2baedc05e303482f845246870cc0d800fb11 --stat; find .. -name
AGENTS.md -o -name AGENTS.override.md; ls .claude/skills' in
/root/.local/share/atc/workspaces/auto-mode-main/.worktrees/geo-771 succeeded in 11ms:
.scratch/codex-review.md | 3606 +++++++++++++++++++++++++++++
evals/lib/build-anonymised-corpus.test.ts | 13 + evals/lib/build-anonymised-corpus.ts | 29 +- 3
files changed, 3641 insertions(+), 7 deletions(-) ../geo-771/AGENTS.md code-style docs-writing
project-testing testing

exec /bin/bash -lc 'cat AGENTS.md; cat .claude/skills/{code-style,testing,project-testing}/SKILL.md;
git diff 5c2f2baedc05e303482f845246870cc0d800fb11 -- evals/lib/build-anonymised-corpus.ts
evals/lib/build-anonymised-corpus.test.ts' in
/root/.local/share/atc/workspaces/auto-mode-main/.worktrees/geo-771 succeeded in 0ms:

# Agent Guidelines

auto-mode is a permission classifier: a core library and a Claude Code mod. When Claude Code is
about to prompt for a tool call, the mod runs the CLI, hands it the pending call on stdin, and reads
allow, deny, or nothing on stdout. Its target is a model that is not Claude driving Claude Code.

`docs/architecture/overview.md` is the authoritative account of how the pieces fit: the path of a
prompted call, the topology, the state auto-mode keeps, and the rules that hold across every stage.
It links one doc per stage and per kind of evidence. Read the overview and the docs for the parts
you touch in full before changing the request path, the policy, or the mod — grep locates code, it
does not teach the invariants. `docs/design/decision-model/` holds the approved parts of the
decision model that the code does not implement.

## Required reading

The rules a task needs are not repeated here. Load the skill for the work before starting it.

| Skill             | Load before                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `code-style`      | writing, reviewing, or renaming any TypeScript — the function-verb taxonomy and comment rules |
| `testing`         | designing, writing, or reviewing tests                                                        |
| `project-testing` | the same, beside `testing` — the preload, host environment, and mod checks                    |
| `docs-writing`    | writing or editing any committed prose: `docs/`, READMEs, this file, skills                   |

## Operations

- Perform all work on a branch in a git worktree under `.worktrees/` (e.g.
  `git worktree add .worktrees/<branch> -b <branch>`) — never commit directly on `main`.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for all commit messages.
- A squash merge makes the PR title the commit subject, so a PR title is a Conventional Commit too.
  `feat(#412): add the retry budget` is a title; `add the retry budget` is not.
- Commit subjects and PR titles use the imperative mood ("add X", never "added X" or a bare noun
  phrase).
- Open PRs against `main` using the PR template (`.github/PULL_REQUEST_TEMPLATE.md`). Descriptions
  are condensed: lead paragraph ≤2 sentences, one-line bullets, ≤150 words — write the short version
  first, don't draft long and trim.
- After pushing, link the PR URL in your response.
- A PR is ready only when its checks are green: watch CI (`gh pr checks <n> --watch`) after opening
  or updating, and report a failure with what you're doing about it.
- Light linting, formatting, and other checks run via lefthook's pre-commit and pre-push hooks.
  Defer to CI for larger checks, as the environment you're operating in may have conservative memory
  constraints.
- `bun run lint` is plain oxlint. `bun run lint:full` adds the type-aware pass and the type check,
  and is CI-only: never run it locally.

## Dependencies

- Pin exact versions — no `^`/`~` ranges. (`bun add` saves exact automatically via `exact = true` in
  bunfig.toml — the rule applies to hand-written edits.)

## Review bots

CodeRabbit reviews every PR. Its shared config lives in the zgeoff/coderabbit repo, and a repo-root
`.coderabbit.yaml` with `inheritance: true` layers repo-specific settings on top. CodeRabbit reads
this file as its guidelines. A review bot added later is named here with its config, and these rules
cover it too.

- A PR is ready only after every bot review is read and every finding is answered: a fixed finding's
  reply cites the commit that fixed it; a declined finding's reply states the reason — when a
  finding contradicts this file, this file wins and the reply names the rule. Reviews land within a
  few minutes of opening; read them with `gh pr view <n> --comments` and
  `gh api repos/<owner>/<repo>/pulls/<n>/comments`. A finding outside the diff arrives in the review
  body, not as a thread, so its answer is a PR comment.
- Resolve a thread once its reply is posted, fixed and declined alike (GraphQL
  `resolveReviewThread`). A finding the agent cannot confidently judge is escalation, not
  disposition: reply saying so and leave the thread open for a human.
- Never teach a bot through chat (`@coderabbitai` learnings and the like) — a correction to bot
  behaviour is an edit to its config, reviewed in a PR.
- Bots review a PR once, at open; an agent invokes a re-review only when asked. The exception is a
  PR that got no review at all, such as one opened before the bot was installed: request it once
  with that bot's documented trigger, such as `@coderabbitai review` for CodeRabbit.

## Layout

The root package is the published `auto-mode`; `evals/` is a private Bun workspace package beside
it. `src/` groups modules by concern, one primary export per file: `request/` parses a mod request
and renders a verdict; `rules/` is the deterministic first tier; `model/` is the second tier and its
decision API client; `messages/` is the Messages API client that the model tier and the judge share;
`shell/` splits a shell command into words, segments and redirections, once, for the local rules,
the containment check and the session scope; `git/` reads a checkout from its git directory, with
one walk up to `.git` per action; `types.ts` holds the types more than one stage reads; `policy/`
assembles the prompt; `config/` holds configuration and presets; `budget/` counts denials per
session; `containment/` denies a write outside the task scope; `scope/` builds that scope from the
configured scope sources and keeps what each session created; `bypass/` lets an in-scope file edit
skip Jev; `judge/` reviews each Jev deny, confirming it with a written reason or overturning it,
through `claude -p` or the Messages API; `secrets/` scans edit content with the bundled Betterleaks
rule set, which `scripts/build-secret-rules.ts` generates; `capture/` appends each judged request to
the opt-in capture, never inside a git work tree; `state/` resolves the XDG directories and reads
and updates the state files, each update under a lock; `process/` runs every child process, capped
in time and output, and alone imports `node:child_process`. `classify-action.ts` runs both tiers
with the containment check and the edit bypass between them and the judge after Jev, applies the
denial budget and writes the action log when its caller asks, and is the library entry point;
`record-scope.ts` adds what a finished Bash call created to the session scope;
`write-action-failure.ts` logs a run that fails before the classifier starts; `index.ts` is the
public API; `eval/index.ts` is the unpublished `auto-mode/eval` subpath; `cli.ts` is the entrypoint
the mod runs. `mods/auto-mode/` is the Claude Code mod; its `contract/` holds the request and
verdict shapes, the message origins and the scope commands that the mod and the CLI share, with no
dependencies, because the mod ships as raw TypeScript. `policy/` at the repo root holds the prompt
itself. `fixtures/` holds mod requests recorded in a live Claude Code session.

`evals/` holds the evaluation tooling: `eval.ts` is the `bun run eval` command, which plans, runs,
resumes and compares one experiment, measures live use from the action log, and anonymises a request
capture into a candidate corpus behind a gitleaks scan; `experiments/` holds one `defineExperiment`
file per experiment (its corpora, its ordered stages, its measurements, the recordings it can
replay) and the registry that lists them; `runners/` are the older `eval:*` scripts, kept for the
live runs no experiment covers: the guidance variant and the `claude -p` judge transport, the
question-shape threshold sweep, and the containment evidence, relay, stale-consent, answer-guidance
and applicability corpora; `corpora/` the committed corpora, with the recorded model answers the
replays read under `corpora/recorded/`; `lib/` the helpers they and the suites share, including the
run, plan, result schemas and interval statistics; and `replay/` the suites that replay the corpora
offline. Evaluation reports live in the private zgeoff/auto-mode-evals repository, not here. Evals
import auto-mode code by package name: `auto-mode` for the public API and `auto-mode/eval` for
internals. Both resolve to `src/` under the `auto-mode-eval` export condition, which `bun run test`,
the `eval:*` scripts and `evals/tsconfig.json` set; without it the subpath does not resolve. Evals
also reuse the root `test-utils/` helpers by path, and those import `src/` directly. Bun cannot
install a workspace's dependency on the root package, so `prepare` links
`evals/node_modules/auto-mode` to the root instead.

The `zgeoff/import-zones` lint rule enforces the module boundaries, in the editor and wherever lint
runs; `.oxlintrc.json` holds its zones and boundaries. Every file under `src/` belongs to a zone: an
orchestrator file, `request/`, a support module or a stage. A new `src/` folder joins a zone there,
in the same PR that adds it. Each import that breaks a zone today carries an
`oxlint-disable-next-line zgeoff/import-zones` comment naming the ticket that removes it.
`lint:full` fails on a disable comment that no longer covers a report, so the exemptions only
shrink. Never add one to make a new import pass. `e2e/import-zones.test.ts` checks that each
boundary still fails a forbidden import.

## Runtime rules

- Bun for development, node for the artifact. `bun test`, never vitest. The published `dist/` runs
  under node 24 on a machine that may have no bun, so a CI step runs the built CLI under real node
  against each fixture.
- `run` and `record`, the two commands the mod runs, always exit 0. The mod reads a non-zero exit as
  a failure, and the JSON on stdout is what decides the outcome. A usage error, such as an unknown
  command or option, exits 2 with the usage on stderr, because no mod call reaches it and a caller
  by hand needs to see the mistake.
- Writing nothing is a verdict, not a failure: it means auto-mode has no opinion and the mod keeps
  the prompt Claude Code was about to show. A body that is not a mod request, a body that is not
  JSON, a failed model call under `onFailure: "defer"`, and the action that exceeds the denial
  budget all write nothing. A classifier decision is always an allow or a deny with a reason; it
  never asks. The denial budget is the only path to a human.
- Runtime dependencies are bundled, not external. The CLI starts once per prompted tool call, so
  resolving a package from `node_modules` is paid on every call.
- Everything CI and the git hooks run is a root `package.json` script; invoke a gate by script name,
  never by re-spelling the command.

## The policy

Everything under `policy/` is verbatim model input. It is not prose for a reader, and the formatter
is configured to leave it alone: its bytes are the prompt and the cache prefix, so a reflow is a
prompt change and belongs in a commit that reviews it as one.

- `decision.md` is the Jev framework, `classifier.md` is the generative framework, `judge.md` is the
  judge's framework, and `rules.md` is the rule list. `containment.md` is the Outside Task Scope
  rule the judge reads when it reviews a containment deny the user named. `denial.md` is the
  instruction every deny reason ends with; it reaches the agent, not a classifier. `loadPolicy`
  splices the rules at the `<rules>` marker. `auto-mode print-prompt` prints the selected base
  policy; configured rules and action evidence are separate request fields.
- Every instruction to block must terminate at a rule name that exists in `rules.md` or an explicit
  configured deny entry. An evaluation rule in `classifier.md` may never order a block on its own —
  a block the model cannot name is one the user cannot read or appeal. A block that cannot be named
  is an allow.
- No evaluation rule may share a name with a rule or exception, or prefix one, because a verdict
  quotes the name back and the reader cannot tell which was meant.
- The rules that deny are prose that needs a reader, so the local tier never denies on a rule. It
  may deny only on a concrete scope finding: a write target outside the task scope, named in the
  deny. Everything else it allows or escalates.

## Mod contract

- Claude Code is the only harness auto-mode targets. Codex and Muse ship their own auto mode, so a
  feature may depend on what only Claude Code offers.
- The mod judges only an `ask` from the rest of Claude Code's permission chain. An existing allow or
  deny is final.
- The mod's request carries the session identity, the action, and the task context, including the
  last direct user message. auto-mode reads no transcript.
- The CLI and the mod ship together, so the request and the verdict are strict. A shape either side
  does not know keeps the prompt. `mods/auto-mode/contract/types.ts` holds both shapes, and a type
  test fails when it and the CLI's schema disagree.
- A hooks module imports only its own plugin's files, by relative path, and `claude-code`; Claude
  Code refuses a package import, its own package included.
- `mods/auto-mode/hooks/parse-decision.ts` alone maps the CLI's verdict to Claude Code's permission
  decision.
- auto-mode never writes Claude Code's settings files.
- A change to the mod contract is verified by hand in a live Claude Code session before it merges.
  The fixtures are recordings, not a substitute for running it.

## Writing

Banned words in all prose, fix on sight: `bites`, `CAS`, `ceiling`, `fence`/`fencing`, `floor`,
`load-bearing`, `seam`, `surface`. A data artifact never speaks — a payload, a field, or a rule
holds, carries, or matches; it does not say, know, or tell.

## Testing

- Co-located `*.test.ts`, flat `test('it …')` blocks, no `describe`. A test file declares no
  function other than a local `setupTest()`.
- Mock-free. Modules assert on return values, file-touching ones use `mkdtemp` trees, and the
  external HTTP boundary is MSW — never a hand-rolled server and never a stubbed `fetch`.
- `toStrictEqual` when the test determines every field; never `toEqual`. Narrow a maybe-value with
  `invariant()`, never a `?.` inside `expect`. Restore state a test mutates in `onTestFinished`.
- Never send a real model call from a test.

---

name: code-style description: Load before writing, reviewing, or renaming any TypeScript in this
repo — every function name must start with a verb from the taxonomy here, and the lint rule
enforcing it reads the same list. Covers module layout and file naming, the function-verb taxonomy
with auto-mode's own verbs, and comments.
---

# Code style

Mechanically enforced rules (oxfmt, oxlint, format-codemod) aren't repeated here — this skill covers
what tooling can't check.

- One primary export per file, and the file name kebab-cases that export (`with-jest-context.ts`
  exports `withJestContext`). Exceptions: `index.ts` entrypoints, `types.ts` for a package's shared
  types, and side-effect-only modules, which are named for what they do (`augment-bun-test.ts`).
- Module order: imports, the primary export, then private helpers in composition order (depth-first)
  — never helpers first. Supporting declarations (consts, interfaces, type aliases) sit directly
  above their first use, never below it and never leading the file; types for the primary export's
  signature may sit just above it.
- Acronyms stay uppercase in identifiers (`runCLI`, `parseCLIArgs`, `ASTNode`, `pkgURL`,
  `isPackageJSON`) — except when one starts a camelCase name, where it lowercases whole (`cliPath`,
  `astNode`). ID counts as an acronym: `userID`, `sessionID` — never `userId` — and `idToken` when
  it starts a name. File names are unaffected: kebab-case lowercases everything (`parse-cli-args.ts`
  exports `parseCLIArgs`).

## Function naming

Every function name starts with a prefix from the closed list below: pick from it, or extend this
skill in the same PR that introduces the new verb. The prefix is a contract — a reader should know
the function's shape without opening it.

**Predicates** — return boolean, no side effects:

| Prefix   | Contract                | Example          |
| -------- | ----------------------- | ---------------- |
| `is`     | type or state test      | `isVarDecl`      |
| `has`    | containment, possession | `hasBlankLine`   |
| `can`    | capability              | `canResize`      |
| `should` | policy decision         | `shouldSkipFile` |
| `needs`  | requirement             | `needsBlankLine` |

**Pure producers** — result comes from arguments alone, no side effects:

| Prefix                        | Contract                                                                  | Example             |
| ----------------------------- | ------------------------------------------------------------------------- | ------------------- |
| `build<Result>[From<Source>]` | default constructor for values; drop `From<Source>` when no single source | `buildEditsFromAST` |
| `define<X>`                   | identity; its only job is compile-time constraint of its literal argument | `defineErrors`      |
| `parse`                       | unstructured input → structure, invalid input reported                    | `parseSource`       |
| `encode`                      | structure → its defined compact or wire form, reversed by `decode`        | `encodeState`       |
| `decode`                      | `encode`'s output → the original structure, malformed input reported      | `decodeState`       |
| `derive`                      | one-way cryptographic derivation from secret material                     | `deriveAvatarKey`   |
| `plan`                        | compute an action without performing it                                   | `planGapEdit`       |
| `pick`                        | select among known alternatives                                           | `pickMode`          |
| `find`                        | search that can miss — null/undefined on miss                             | `findPrevious`      |
| `get`                         | cheap access that cannot miss (throwing on a broken invariant is fine)    | `getNodeEnd`        |
| `collect`                     | gather from a traversal or scan                                           | `collectChildNodes` |
| `count`                       | how many                                                                  | `countNewlines`     |
| `split`                       | one value → parts                                                         | `splitLines`        |
| `merge`                       | parts → one value                                                         | `mergeWindows`      |
| `sort`                        | reorder                                                                   | `sortEdits`         |
| `format`                      | value → human-readable string                                             | `formatRange`       |
| `render`                      | structure → output text or markup                                         | `renderHunk`        |
| `normalize`                   | variant forms → the canonical form                                        | `normalizePath`     |
| `resolve`                     | follow indirection to a concrete value                                    | `resolveBinPath`    |
| `expand`                      | compact form → full form                                                  | `expandInputs`      |
| `compress`                    | value → its reversible compact encoding                                   | `compressGraph`     |
| `decompress`                  | reverse a `compress` encoding (non-encoded shorthand is `expand`)         | `decompressGraph`   |
| `to<Result>`                  | cheap representation change                                               | `toPosixPath`       |
| `transform`                   | a package's own source→source operation                                   | `transform`         |

**Effectful** — touches the world (filesystem, streams, processes, registries):

| Prefix         | Contract                                                                                                                                | Example            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `apply`        | perform previously planned changes                                                                                                      | `applyEdits`       |
| `create`       | bring a resource into existence (file, directory, process)                                                                              | `createWorkDir`    |
| `claim`        | atomically take exclusive ownership of a work item or resource; ownership ends at commit or an explicit release                         | `claimNextChain`   |
| `read`         | pull raw content from filesystem or network into memory                                                                                 | `readSource`       |
| `load`         | read **and** parse into a ready structure                                                                                               | `loadConfig`       |
| `write`        | persist to the filesystem                                                                                                               | `writeOutput`      |
| `remove`       | delete a resource                                                                                                                       | `removeStaleDist`  |
| `update`       | mutate existing state or resource in place                                                                                              | `updateIndex`      |
| `upsert`       | single-statement insert-or-update keyed by a natural or composite key, refreshing the conflicting row's columns in place                | `upsertUser`       |
| `set`          | assign a store's named state slice wholesale — the store-setter idiom; partial mutation is `update`                                     | `setSelectedNode`  |
| `toggle<Flag>` | invert a boolean state slice                                                                                                            | `toggleDevCamera`  |
| `reset`        | return state to its initial value                                                                                                       | `resetCombatState` |
| `print`        | write to stdout/stderr                                                                                                                  | `printHelp`        |
| `run`          | execute a subprocess, task, or whole pipeline                                                                                           | `runCLI`           |
| `check`        | evaluate and report findings; effects allowed per mode                                                                                  | `checkFile`        |
| `try<X>`       | X with failures captured as a value instead of a throw                                                                                  | `tryCheckFile`     |
| `register`     | add to a registry the caller doesn't own                                                                                                | `registerMatcher`  |
| `subscribe`    | attach a listener to an event source, returning or enabling detachment                                                                  | `subscribeToTicks` |
| `unsubscribe`  | detach what `subscribe` attached                                                                                                        | `unsubscribe`      |
| `assert`       | throw when an invariant doesn't hold                                                                                                    | `assertSpan`       |
| `require`      | throw unless a runtime condition holds — a guard real input can trip (`assert` covers invariants)                                       | `requireAuth`      |
| `verify`       | test a claim or credential against evidence, rejecting on mismatch                                                                      | `verifySession`    |
| `emit`         | dispatch an event or notification                                                                                                       | `emitProgress`     |
| `send`         | transmit a payload to a remote receiver (fire-and-forget or RPC — no resource semantics; REST mutations are `create`/`update`/`remove`) | `sendWebhook`      |
| `wait`         | block until an event or condition resolves; may return the awaited value                                                                | `waitForMessage`   |
| `setup`        | prepare the environment or fixture the following code assumes; `teardown` reverses it                                                   | `setupTest`        |
| `teardown`     | release what `setup` prepared                                                                                                           | `teardownTest`     |
| `start`        | put a long-running resource into service (server, worker, poll loop); `stop` reverses it                                                | `startQueues`      |
| `stop`         | take a long-running resource out of service, releasing what `start` acquired                                                            | `stopWorker`       |
| `drain`        | consume a pending backlog until empty                                                                                                   | `drainJobs`        |

**Wrappers and factories** — the result is behaviour, not data:

| Prefix    | Contract                                  | Example           |
| --------- | ----------------------------------------- | ----------------- |
| `with<X>` | HOF that runs a callback inside a context | `withJestContext` |
| `make<X>` | factory whose result is itself a function | `makeExcluder`    |

**Framework conventions** — where the ecosystem's prefix is required, it wins:

| Prefix                   | Contract                                                                                                                | Example          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `use<X>`                 | React hook — the prefix drives rules-of-hooks linting; helpers inside a hook follow the normal taxonomy                 | `useDebounce`    |
| `on<Event>`              | event-callback prop or parameter                                                                                        | `onRowClick`     |
| `handle<Event>`          | local implementation passed to an `on<Event>` prop — the idiomatic React pair; the `handle` ban applies everywhere else | `handleRowClick` |
| `handle<LifecycleEvent>` | implementation of an engine lifecycle callback, keyed by the engine's lifecycle-event enum                              | `handleTick`     |

**Banned** — each is a vaguer or synonymous form of a listed verb; use that one instead: `handle`
(except the `handle<Event>` framework conventions), `process`, `manage`, `do`, `perform` (say what
it does), `execute` (→ `run`), `compute` (→ `build`), `fetch` (→ `read`), `save`/`store` (→
`write`), `delete` (→ `remove`), `search`/`lookup` (→ `find`/`get`).

Algorithm-native vocabulary (`walk`, `backtrack`, `slideDiagonal`) is allowed inside the module
implementing that algorithm — forcing list verbs onto textbook terms hides the algorithm.

### Project verbs

Project additions to the shared taxonomy, declared in `.oxlintrc.json`:

- `classify` — decide which category a value falls into, from a closed set the caller knows
  (`classifyLocally`, `classifySegment`). Distinct from `check`, which reports findings rather than
  returning a category.
- `record` — add what a finished action created to the state a later action reads (`recordScope`).
  Distinct from `write`, which persists a value the caller already holds.

`main` is exempt.

## Comments

- No JSDoc; `zgeoff/no-jsdoc` enforces it. A fact a reader needs belongs in the code, a named
  constant, a test whose name states it, the commit body, or `docs/`.
- A `//` comment holds one thing: the reason the obvious alternative is wrong, when the cause lives
  outside the file — a harness quirk, a library defect, a measured number. Three lines at most.
- Comments describe the code as it is: no history, no project state, and no naming of other
  declarations, which a rename strands.

---

name: testing description: Testing rules for zgeoff repos — the three package regimes, flat
behavioural tests, a setupTest with onTestFinished cleanup, inline data and tested factories, strict
assertions and inline snapshots, controlled time, condition waits, real filesystems and transports,
and the narrow cases for module mocks. References cover real databases, React and TanStack clients,
HTTP mocking with MSW, observability, Claude Code mod checks, and native Go and NixOS conventions.
Load when designing, writing, or reviewing tests.
---

# Testing

`bun test` loads every test file into one process, so state that one file leaves behind is state the
next file sees. The repo's `bunfig.toml` preload owns that process: it registers the matchers, the
mock server lifecycle, and every reset that returns shared state to a clean baseline after each
test. Per-test resources register cleanup with `onTestFinished` where they are acquired. A test
exercises real behaviour through real code, and it reaches for a stand-in only at a boundary the
test cannot cross. When existing tests break these rules, you align them while you work on the code
they cover.

This skill is the shared base that repo-sync delivers from zgeoff/tools: edit it there, never in a
downstream copy. When the repo has a `project-testing` skill, load it as well. That skill adds this
repo's harnesses, regimes, and stricter rules. A project skill never relaxes a rule here; a repo
that needs an exception changes this skill.

A repo that runs the skill gate refuses an edit to a test file until the session that makes it has
loaded the skills the path needs. A subagent loads them itself, because the main session's loads do
not count for it. A compaction clears every load, so load the skills again after one. The gate sees
only Edit, Write and MultiEdit: change a gated file with those tools, never with a Bash redirect,
`tee`, `sed -i`, or a script. The gate does not check Bash, and that gap is accepted, not a way
around the rule.

## Languages and runners

Apply the behavioral principles across languages. The syntax, matchers, hooks, and file conventions
in this file describe Bun tests. For Go, read [Go testing](./references/go.md); for Nix evaluation
and VM tests, read [NixOS testing](./references/nixos.md). Those mappings preserve isolation,
explicit scenarios, independent expectations, real boundaries, and meaningful failures through the
native runner's mechanisms.

## Regimes

Each package falls into one regime, chosen by the furthest edge its code reaches. The regime decides
which reference to open beside this file.

| Regime        | The package                                       | The edge it tests against                           | Reference                                                                  |
| ------------- | ------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------- |
| Pure          | A library or CLI with no service or database edge | Return values, temp directories, the spawned binary | none                                                                       |
| HTTP-mocked   | A client of a remote service, or a web app        | MSW handlers over an in-memory store                | [HTTP mocking](./references/http.md), [frontend](./references/frontend.md) |
| Real database | A service, app, or library that owns a schema     | The real engine, isolated per test                  | [database](./references/database.md)                                       |

Code that records metrics, spans, error reports, or structured logs follows
[observability](./references/observability.md) in any regime. A Claude Code mod's hooks follow
[Claude Code mod checks](./references/claude-code-mods.md), which `claude plugin test` runs instead
of `bun test`.

## Principles

These decide a case that the rules below leave open.

- **Visible beats concise.** A reader understands a test from its body alone. Repeated literals cost
  a few lines; setup the reader cannot see costs a wrong conclusion.
- **Every test stands alone.** A test passes when run by itself, in any order, and beside every
  other test in the process.
- **Behaviour is the contract.** A test pins what the unit does for its callers. A refactor that
  keeps that behaviour, such as a renamed private helper or a reworked loop, leaves every test
  green.
- **Real first, stand-ins at the edge.** Each stand-in marks a spot where the test and production
  can disagree. Use one only for what the test cannot reach, and make it faithful: real status
  codes, real payload shapes, and the production types.
- **Test utilities are code.** A helper that tests depend on lives in the repo's shared test utils
  with its own tests, because a broken helper fails silently in every suite that uses it.
- **The assertion is the test.** A test checks exactly what its assertions check. One loose
  assertion lets a broken unit pass.

## Structure and naming

- Write each test as a top-level `test(…)` call. `describe` is banned: its scope invites shared
  hooks that couple tests, and grouping comes from the file and the title instead.
- A title starts with "it" and reads as verb, outcome, then condition:
  `it rejects a title longer than 120 characters`. It names observable behaviour, never an internal
  identifier, so `it marks the import as failed` and not `it sets status to 2`.
- When one file tests several units, such as the procedures of one router, a `#<unit>` prefix takes
  the place of "it": `#archiveNote rejects a note that is already archived`. A file that tests one
  unit uses no prefix.
- A test body arranges, acts, then asserts. The formatter owns spacing, including gaps between
  phases; keep its layout when it joins statements from different phases. Phase comments such as
  `// act` never appear. An ordinary test acts once: it has one act phase, which may hold several
  calls whose combined result the assertions check, such as the two runs that a determinism test
  compares. A body with two independent act-and-assert pairs holds two tests, so split it. When a
  second act depends on the first, the first act becomes arrangement, as `setupTest` describes. A
  pure function's test may collapse the three phases into one `expect` line.
- `test.each` serves a closed decision table only: rows of plain data, and a title template that
  starts with "it" and interpolates the input that varies or an accurate descriptive label for that
  input. The row supplies the actual values to the test. Any other set of cases gets a separate
  `test()` for each case.
- Tests sit beside the module they test (`parse-entry.ts` and `parse-entry.test.ts`), and a test of
  a program's entry module, such as `cli.ts`, sits beside that module too, so `src/` stays a mirror
  with one test file per module. Two root directories are the exceptions: `e2e/` holds the
  end-to-end suites that run the whole program, and `evals/` holds the
  [evaluation suites](#evaluation-suites). The repo has no other `test/`, `tests/`, or `__tests__`
  directory.

```ts
test.each([
  ['1500ms', 1500],
  ['2s', 2000],
  ['1m', 60_000],
])('it parses %s as %d milliseconds', (input, expected) => {
  expect(parseDuration(input)).toBe(expected);
});
```

### End-to-end suites

An end-to-end suite splits by user journey, one file per journey: `e2e/tui-spawn.test.ts` beside
`e2e/tui-attach.test.ts`. A journey test may chain dependent act-and-assert phases, because each
step of the journey needs the state that the step before it left. Ordinary tests outside `e2e/` act
once. Generated sequences follow [Property tests](#property-tests).

An outer harness may reuse expensive hosts, services, and immutable fixture inputs across journeys.
Each journey keeps its own file, setup, scenario, and cleanup. Reset shared infrastructure to a
clean baseline before each journey; test that the reset removes dirty state, including after failure
or interruption. Recreate the environment when a reset cannot restore the baseline. The harness owns
infrastructure startup and shutdown; test files keep the hook rules in
[Setup and cleanup](#setup-and-cleanup).

Keep command construction importable. Test argument and flag-position cases through the real parser
in module tests; keep binary journeys that check the assembled program.

### Evaluation suites

An evaluation suite in `evals/` checks production code against a committed corpus or report: it
replays a corpus of recorded traffic through the production path, or checks a committed evaluation
report against the code. It tests a corpus, not one module, so it has no module to sit beside.

- The input is the committed corpus or report file, read through one tested loader. The cases are
  never restated as inline literals.
- Helpers live in `evals/test-utils/` with tests of their own. A stand-in replaces only what a
  recording cannot reproduce, such as the disk or the forge, and the suite injects it into the
  production path.
- A deliberate mismatch between the report and the code fails the suite. A suite that passes on a
  stale report checks nothing.
- Every other rule in this skill applies to an evaluation suite.

### Loops

A loop that runs an assertion once per input hides which input failed, and its first failure stops
the rest. Replace it with `test.each`, or write each case as its own test. A loop of `expect` calls
over the items of one result becomes one collection matcher, which reports the whole collection on
failure:

```ts
expect(listOpenNotes(store)).toSatisfyAll((note: Note) => note.archivedAt === null);
```

Two loops that check a set the module owns stay legal:

- A completeness loop that walks a module's own registry, such as checking that every exported
  renderer has a preview.
- A conformance loop that drives each generated case through
  `await expect(conformanceCase.run(app)).toResolve()`.

Neither loop may compute its expectation with the same transformation it checks. A loop that only
arranges, such as inserting 51 rows to cross a page limit, holds no assertion and stays legal.
Prefer `await Promise.all(Array.from({ length: 51 }, …))` when the order of the rows does not
matter.

### Property tests

Use fast-check for generated inputs or operation sequences whose combinations matter. Keep fixed
decision tables in `test.each`. A property runner may dispatch generated operations, branch on
expected outcomes, and check invariants after each operation. These permissions apply inside the
property runner and its operation interpreter; ordinary tests keep their loop, branching, and
single-act rules. Await an async `fc.assert` so a failed property fails the enclosing test.

- Check relevant transitions, not only the final state. Unexpected errors fail the property; an
  expected-outcome branch never suppresses them.
- Derive invariants from an independent contract or a simpler model, never a copy of the production
  algorithm.
- Start each generated case from clean state and release its resources before the next case. Use a
  tested scoped helper for case resources, with cleanup on success and failure. `onTestFinished`
  runs after the enclosing Bun test, not after each generated case; its fallback cleanup alone does
  not isolate cases.
- Preserve the seed, reduced counterexample, and applicable replay information. Add an explicit
  regression test for a discovered sequence when it represents a behavior the suite must keep.
- Keep separate assertions for independent results and tests for behavioral stand-ins. Do not reduce
  generated coverage to conceal slow tests. The interpreter needs no rewrite into command classes
  solely for alignment.

## Setup and cleanup

Process-wide setup and cleanup belong to the preload. Per-test setup belongs to one local function,
`setupTest()`, that the test calls itself. `beforeAll`, `beforeEach`, `afterEach`, and `afterAll`
never appear in a test file.

### `setupTest`

- `setupTest()` builds the runtime the test needs: temp directories, servers, clients, database
  handles, recorders. It takes a typed config object, returns named properties, and has no `if`. Its
  config chooses which dependencies to wire, and it never carries scenario data.
- The scenario belongs to the test body: every row, override, and value that selects the case, such
  as agent entries or authentication tokens. A scenario value stays there even when every test uses
  the same value. `setupTest()` may write boot data without which the unit cannot run; each value
  carries a one-line comment that states why boot needs it.
- Return runtime handles and generated infrastructure paths from `setupTest()` as named properties,
  such as a database handle, a temporary directory, or a VM's system path. They remain runtime
  wiring when a test compares them. Keep the scenario's choice of resource or generation visible in
  the test body.
- An earlier act that the test's one act depends on, such as starting the session that the test
  attaches to, is arrangement. No assertion checks it, because a separate test covers that act.
  `setupTest()` runs it and returns the handles it produced. An earlier act that carries scenario
  data, such as saving the note that the test then archives, stays in the arrange phase of the test
  body instead, because `setupTest()` never carries scenario data. An earlier action that only some
  tests need stays visible in those tests' arrange phase without assertions; do not hide it behind a
  conditional setup flag.
- A test file declares one function, `setupTest()`, and nothing else. A helper the tests want goes
  one of three ways: inline it where it is used, swap it for a registered matcher, or move it to the
  shared test utils with tests of its own. A file with nothing to wire has no `setupTest()`. One
  exception: a collection-time skip gate may keep its awaited probe, and named gates derived from
  it, at module level. Only `skipIf` reads them, each repeated condition is named once, and a
  comment gives the reason: Bun 1.4.2's `skipIf` takes a boolean and has no in-body skip.
- Each test file keeps its own `setupTest()`. A shared one gathers a flag for every suite that uses
  it.

Register cleanup with `onTestFinished` immediately after each successful resource acquisition, so a
later setup step or assertion that throws still releases the resource. `setupTest()` returns named
properties; it adds no disposal symbol solely to forward cleanup. The test holds the result in a
plain `const`.

```ts
async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'notes-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it reads an empty file as no entries', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'entries.txt'), '');

  expect(await readEntries(ctx.dir)).toStrictEqual([]);
});
```

Synchronous acquisition and cleanup keep `setupTest()` synchronous. An async cleanup callback does
not make setup async. Hold the result in one binding and read its members; never destructure it. The
binding names are fixed: `ctx` for `setupTest()`, `hook` for `renderHook(…)`, and `rendered` for
`render(…)`.

### Cleanup

Each kind of state has one cleanup tool.

| State                                                   | Cleanup                                           |
| ------------------------------------------------------- | ------------------------------------------------- |
| A resource that `setupTest()` or the test body acquires | `onTestFinished(…)` immediately after acquisition |
| Process state the test body changes                     | `onTestFinished(…)` immediately after the change  |
| State that a preload reset covers                       | Nothing                                           |

`try`/`finally` never appears in a test. `onTestFinished` runs on failure as well, keeps teardown
beside the acquisition, and needs no `?.` guard for a resource the test never reached. A shared test
util may register `onTestFinished` for its callers. These helpers must run inside a test. A test of
such a helper proves its cleanup ran by asserting in an `onTestFinished` hook. `onTestFinished`
hooks run first-in, first-out, so register that check after the helper's call, and register the
removal of any directory the check reads after the check, not immediately after creating it. This is
the only place an assertion leaves the test body.

When resources have cleanup dependencies, register one callback that closes them in the required
order. Every cleanup must run even if another cleanup throws. Use a disposable stack when reverse
acquisition order matches those dependencies, and register its disposal immediately. Do not hold
that stack with `using` or `await using`, or transfer it with `move()`.

```ts
async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dir = await mkdtemp(join(tmpdir(), 'notes-'));

  stack.defer(() => rm(dir, { recursive: true, force: true }));

  const db = new Database(join(dir, 'notes.db'));

  stack.defer(() => db.close());
  applyNotesMigrations(db);

  return { dir, db };
}
```

If the scenario needs an explicit shutdown before the next action, call it in the test body. Keep
fallback cleanup registered and make it safe after shutdown. Fixture callers need no `using` or
`await using` declaration.

`onTestFinished` runs after all `afterEach` hooks, including the preload's resets. Cleanup uses
captured paths and handles, rather than environment overrides that those resets remove. Tests that
use this hook run sequentially within each file: do not enable `test.concurrent`, `--concurrent`, or
`concurrentTestGlob` for them. Separate worker processes and CI jobs can still run in parallel.

```ts
test('it reads a note written by another connection', async () => {
  const ctx = await setupTest();

  const writer = new Database(join(ctx.dir, 'notes.db'));
  onTestFinished(() => writer.close());

  writer.run(`INSERT INTO notes (title) VALUES ('from writer')`);

  expect(listNoteTitles(ctx.db)).toStrictEqual(['from writer']);
});
```

A test overrides an environment variable through the repo's env util, and the preload restores every
override after each test. A test never assigns `process.env` directly. A test never relies on a
unique key to avoid another test's rows: isolation comes from resets, not from luck.

### A test that fails only in the full run

A test that passes alone and fails beside others has found a cleanup gap. Find it this way:

1. Run the failing test alone, and confirm it passes.
2. Run it with half of the other test files, and keep halving toward the half that still makes it
   fail.
3. In the file that remains, find the state it leaves behind: a module cache, a singleton, a store,
   an unrestored override.
4. Add that state's reset to the preload.

Reordering the tests or choosing unique keys hides the gap and leaves it for the next test to find.

## Test data

- Plain inputs stay inline at the call site: arguments, options bags, config values. Write the
  literal again in the next test. A module-level fixture, a baseline object shared between tests, or
  a constant that only names a literal (`const EMPTY = ''`) never appears in a test file.
- A domain type that crosses a module boundary gets a factory, `build-mock-<type>.ts` exporting
  `buildMock<Type>`, in the shared test utils as soon as a test needs one. A factory returns a value
  and brings no resource into existence, so it takes the `build` prefix from the repo's
  function-naming table. A composite that writes rows creates a resource and keeps `create`. A type
  that another package owns, such as an SDK result, is in the same position on first use. A type
  private to the module under test stays an inline literal.
- A factory returns a complete plain object. Fields whose value is arbitrary default to
  `@faker-js/faker` values, which prove the unit does not depend on one particular value.
  Constrained fields, such as an enum or a discriminator, take a fixed default. A deterministic
  package, whose outputs are pinned as golden values, takes fixed defaults throughout. The preload
  seeds faker once, so a failing run reproduces.
- A factory defaults each foreign key to a fresh id and never requires a parent. Wiring real parents
  is a composite's job.
- A factory for a class returns an instance of that class, so `toStrictEqual` against a real
  instance passes. A factory with nested fields deep-merges each override into fresh defaults.
- A row factory returns the table's insert shape, and a contract factory returns the API type. They
  are separate factories, kept in the packages that own each shape.
- Each factory has a test file with at least two tests: `it builds a default <type>`, which asserts
  the whole shape with `toStrictEqual` and asymmetric matchers, and
  `it applies overrides on top of the defaults`. Add a test only for a factory branch that those two
  cannot reach, such as an override that leaves out an optional field (`undefined` meaning absent),
  a field derived from another field, or a keyed or nested override that builds each child from its
  own factory. Each added test fails when that branch is deleted. Never add one that checks faker's
  output or the plain merge of overrides again.
- The test that uses a factory's value calls the factory itself. A helper that presets overrides is
  a second set of defaults that the reader cannot see.
- A runtime stand-in that implements behaviour or assumptions about a dependency lives in the shared
  test utils under a name for what it impersonates. Its prefix follows the repo's function-naming
  table. A stand-in that starts something long-running, such as a stub server, is
  `start-stub-<thing>.ts`. A stand-in that creates a resource, such as a stub repository on disk, is
  `create-stub-<thing>.ts`. Every other stand-in is `build-stub-<thing>.ts`. It has its own tests,
  which pin the assumptions it makes about the real thing. An executable stand-in script uses
  `run-stub-<thing>.ts`; an imported helper that starts it keeps `start-stub-<thing>.ts`.
- Keep bare call recorders (`mock()` with no implementation) and no-op callbacks (`() => {}`)
  inline, including a recorder inside an object such as `{ sendEvent: mock() }`. Never extract a
  wrapper or add a test whose only purpose is to check that the mocking library records calls. A
  no-op executable placeholder stays inline through the shared file helper when the test needs only
  an executable. Extract a dedicated stand-in when the script models arguments, output, or failures.

### Composites

A composite assembles one domain concept from factories and persistence helpers: a signed-in user
with its session, or an order with its customer. It creates each dependency that the caller does not
pass, and it returns data, never clients, apps, or servers.

- A composite's name is a concept the system already names. Two readers who see just the name
  describe the same contents. A name that lists its parts, such as
  `createUserWithTwoNotesAndAShare`, is a convenience grouping: compose the primitives in the test
  instead.
- A variant is a separate file and export, such as `createAdminUser` beside `createUser`. It is
  never a flag inside one composite.
- A composite has no batch form. Several records are several calls.

## Schemas and parsers

- Feed a parser or a validator inline literal payloads: ones it accepts and ones it rejects. A
  factory produces values built to pass the schema, so its output cannot show the schema rejecting
  anything.
- A rejection payload repeats the complete valid literal and alters a single field, so the reader
  sees which field causes the rejection.
- A rejection test asserts the path of the reported issue, in one shape, because a payload can be
  invalid for many reasons and `success: false` passes for all of them:

  ```ts
  expect(result.error?.issues).toPartiallyContain({ path: ['title'] });
  ```

  Pass the expected partial object directly. Never read `issues[0]`, which ties the test to issue
  order.

- An acceptance test asserts `result.data`. For a schema that passes values through, assert
  `toStrictEqual(payload)`. For one that transforms, assert the transformed value. A bare
  `success: true` passes for a schema that strips or coerces a field wrongly.

## Assertions

- Use `toStrictEqual` when the test determines every field of the expected value: the full shape is
  the contract. When the value carries fields that the test does not determine, such as faker
  defaults, timestamps, or generated ids, use asymmetric matchers inside `toStrictEqual`, or
  `toMatchObject`. Choosing a partial match because the full literal is long is a defect. `toEqual`
  never appears.
- Assert each result on its own. Never assemble unrelated results or observations into an object
  only to put them under one `toStrictEqual`. A normalized projection of one result, such as a
  command's exit code, stdout, and stderr, stays together. A later request's status is a separate
  assertion. Independently meaningful scalar checks use separate `toBe` calls.
- Derive an expected value from the contract, independently of the unit's own calculation. For a
  filesystem path, use a known package or fixture root plus the explicit expected location, rather
  than repeating the unit's relative path expression. Keep a behaviour check where it proves the
  derived value works.
- A recovery test checks that the injected fault occurred and that recovery succeeded. Capture the
  earlier state during arrangement, then assert it at the end alongside the final state; use
  separate scalar assertions for each state.
- After a mutation, one `toBe` on the field that changed is enough.
- Snapshots are inline only. `toMatchInlineSnapshot` pins a golden value: deterministic machine
  output that no person derives by reading the code, such as a generated SQL string or a rendered
  report. A value a person wrote by hand, such as a spec test vector, keeps an explicit matcher,
  because a snapshot of it would bless whatever the code produced. File snapshots and component
  snapshots never appear.
- A deterministic pipeline's suite opens with two tests. A frozen-golden test feeds one hand-written
  literal input and pins the full output inline. A determinism test asserts that the same input
  gives equal outputs: `expect(run(input)).toStrictEqual(run(input))`. The golden input is never a
  factory call, because regenerating snapshots must never change the input.
- A stand-in's derived values, such as a fake hash or a fake signature, are not contract. Assert
  their properties: their shape, that the same input gives the same output, and that different
  inputs give different outputs.
- A sweep that deletes resources has a test that names what it never touches, such as
  `it never removes another owner's files`.

### Errors

- Assert an error at the strictness its contract needs: `toThrow()` when only the throw matters,
  `toThrowWithMessage(Error, /…/)` when the message is contract, and `toMatchObject({ code })` when
  the error carries a typed code. An inline snapshot pins the whole error when its full text is a
  golden value.
- Each error that a unit declares has its own test.
- A `try`/`catch` never asserts an error: when the call does not throw, the assertion never runs.
- `bun-types` declares `.rejects` and `.resolves` as synchronous matchers, and Bun settles the
  promise inside the matcher. Write these chains without `await`. `toResolve()` and `toReject()`
  return a promise: always `await` them.

```ts
test('it rejects a note owned by another user', async () => {
  const ctx = await setupTest();

  const note = await saveNote(ctx.db, { ownerID: 'user_a', title: 'private' });

  expect(readNote(ctx.db, { noteID: note.id, userID: 'user_b' })).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
});
```

### Authorisation pairs

An access rule lands with two tests: the allowed caller succeeds, and the other caller is refused.
The refused case names the other caller in its title, such as
`it rejects a note owned by another user`. A read path that hides a record instead of refusing
asserts the hidden result, such as `toBeNull()`.

### Narrowing and branching

An ordinary test body never branches. Each path through the unit gets its own test. Generated
operation dispatch follows [Property tests](#property-tests).

Narrow a value that may be missing with `invariant(value)` or an explicit `throw` on the line before
the assertion. Optional chaining inside `expect` is safe when the matcher fails on `undefined`,
because a missing value then fails loudly:

```ts
expect(result.data?.title).toBe('groceries');
```

Four matchers pass on `undefined`: a `.not` matcher, `toBeUndefined`, `toBeFalsy`, and `toBeNil`.
With those, `?.` or `??` turns a missing value into a pass, so narrow first:

```ts
invariant(result.data);
expect(result.data.error).toBeUndefined();
```

When you are unsure which kind a matcher is, narrow.

An assertion inside an ordinary callback passes when the callback never runs. Copy the value out of
the callback into a variable, then assert on it once the call returns. Property-runner assertions
follow [Property tests](#property-tests).

## Time and waiting

Control time in the most explicit form the code allows:

1. **A time argument.** Code that advances through time takes the duration or the timestamp as a
   parameter: `scheduler.advance(30_000)`.
2. **An injected clock.** Code with its own loop or timers takes a `now` function or a clock object,
   and the test steps it.
3. **Fake timers.** Code with no injection point, such as a third-party library, gets
   `setSystemTime()` and fake timers. The test restores them in `onTestFinished`.

A Claude Code mod reads the wall clock and never the host's clock, for the reason in
[Claude Code mod checks](./references/claude-code-mods.md#time).

A value that depends on the wall clock is built relative to `Date.now()`
(`expiresAt: new Date(Date.now() - 1000)`) and asserted with range matchers such as `toBeAfter` and
`toBeWithin`, never with an exact timestamp.

A test waits on a condition with a polling `waitFor`, never with a sleep. A sleep makes the suite
slower by its full length on every run, and it still fails on a slow machine. When the code offers
nothing observable to wait on, the code lacks a signal: add one, such as an event, a log marker, or
a state flag, and wait on that.

### Native timers and scenario delays

A test of a native runtime or kernel timer uses the shortest faithful configurable deadline through
the real mechanism. Configure startup-only settings in an isolated child process. Include a failure
control that proves an unprotected operation crosses the deadline; a nominal timeout value alone
does not prove expiry. Keep default configuration coverage separate. Wait out the real default only
when the runtime cannot expose a shorter faithful deadline, and run that case through an explicit
script.

When a third-party library owns a timer, runs it internally, and takes only a duration in its
config, pass the shortest duration the library accepts and wait on the observable event, never with
a sleep. Add a control: the same duration with a live peer does not fire. Fake timers stay for
libraries whose timers do not interleave with real I/O.

A real delay may define an end-to-end workload rate or a seeded fault-injection offset. State the
rate or fault purpose and preserve replay information. A claim that a fault lands mid-operation
needs evidence of overlap and checks of the fault and recovery. Use phase-targeted checks for known
races. A delay that only guesses when a service settles remains a condition wait; elapsed age must
matter to the contract to justify a dwell.

## Boundaries

Stand-ins replace a boundary, never the code inside it. A test never stubs `fetch`, an HTTP client,
or a method of the unit's own services: the path from the call to the boundary runs for real,
including serialisation and error handling.

| Boundary                                       | The test uses                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| Pure computation                               | Return values, with no stand-in                                                       |
| A CLI                                          | The real binary, spawned end to end                                                   |
| The filesystem                                 | A real `mkdtemp` tree per test                                                        |
| A database                                     | The real engine, isolated per test, as [database](./references/database.md) describes |
| A remote HTTP or RPC service                   | MSW handlers, as [HTTP mocking](./references/http.md) describes                       |
| A service with a cheap container               | The real service in a container                                                       |
| An SDK with a command layer                    | A stand-in at the command layer                                                       |
| A queue or pub/sub without a faithful emulator | A wrapper with queryable state, as [HTTP mocking](./references/http.md) describes     |

A module that is hard to test without a stand-in takes its I/O from its caller: test the pure core
with values, and test the I/O edge against the real boundary.

### Real applications and transport

A CLI, SDK, or server-side client of a service in the same repo tests against the real application
wiring, with isolated data and stand-ins at host boundaries the runtime cannot run. A child process
reaches that application through a real listener. Frontend component tests keep the MSW boundary in
[frontend testing](./references/frontend.md), with the real SDK and RPC serialization.

Use a tested real network stand-in where interception cannot exercise the contract: certificate
verification, TLS or tunnel behavior, Unix sockets whose native options interception loses, or
requests from a child process, container, or VM outside the intercepted process. Confirm a claimed
interceptor limitation with the installed versions. Keep real routing and serialization,
schema-backed rich mock state, and visible failures for unexpected calls. Ordinary remote HTTP
behavior keeps MSW where it applies.

### Filesystem

A real temp tree costs about 1 to 2 ms per test for a handful of small files, and more as the tree
grows. A test pays that for real behaviour: `fs.watch`, permissions, symlinks, `Bun.file`, and
`Bun.write`, which an in-memory filesystem fakes or misses. Take every path from the temp root and
pass it into the module. Never steer a module through `process.cwd()` or through a `HOME` value set
after startup, because Bun reads some of those once at startup.

### Program-fixed paths and global resources

Kernel or program contracts may impose a path inside the test environment, such as a certificate
trust directory, procfs, or a VM mount point. State which contract fixes it. Use a fresh test-owned
namespace or resource with checked ownership; choose a disposable environment when ownership cannot
be guaranteed. Each test creates fresh scenario resources and cleans them up.

Distinct names for machine-global resources allocate a namespace, like `mkdtemp`; they never replace
row or store isolation. Refuse collisions with resources this run does not own before overwriting,
truncating, mounting, or deleting them. Register cleanup immediately after successful acquisition,
and release only what this run acquired. A generated name is not proof of ownership. Cleanup remains
safe after partial failure, interruption, and explicit shutdown.

### Infrastructure failures

A failure branch runs on a real failure:

- A database or socket that is down: point the real driver at an address where nothing listens, and
  destroy the handle in `onTestFinished`.
- A downstream service that errors: a per-test MSW handler that throws or returns the error status.
- One statement that fails in the middle of a flow: real state that makes it fail, such as a
  conflicting row for a constraint, or a held lock with a short `lock_timeout`.

A spy that makes one method of a real object reject never appears. A branch that neither a dead
transport nor real state can reach shows a missing injection point: put that dependency behind an
injected boundary.

### Module mocks

`mock.module` never appears in a test file. In one process, a module mock in one file applies to
every file that loads after it. Two kinds of module mock are legal, and each lives in a preload
module named `register-<module>-mock.ts`:

- **A stand-in for what the test runtime cannot host**, such as a WebGL scene, a `SharedWorker`, or
  a framework's ambient server context. It reads from a stub store, and one exported setter is the
  only way a test changes that store.
- **A wrapper that a library documents for testing**, which keeps the real behaviour and adds one
  hook, such as the store reset that `@zgeoff/bun-test-react/zustand` installs.

Any other module mock is banned, auto-mocking included. A module mocked because of what it imports
shows a defect in the import graph: fix the import graph instead.

## Matchers

The `@zgeoff/bun-test-extended` preload registers the jest-extended matchers, and a package's
`augment-bun-test.ts` import gives `tsc` their types. Typecheck fails on a matcher name that does
not exist. Prefer a matcher to a hand-written check:

| Value             | Matchers                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| Array             | `toIncludeAllMembers`, `toIncludeSameMembers`, `toIncludeAllPartialMembers`, `toPartiallyContain`, `toSatisfyAll` |
| Object            | `toContainEntry`, `toContainEntries`, `toContainAllKeys`, `toBeFrozen`                                            |
| String            | `toStartWith`, `toEndWith`, `toInclude`, `toEqualCaseInsensitive`, `toEqualIgnoringWhitespace`                    |
| Any value         | `toBeNil`, `toBeOneOf`, `toSatisfy`, `toBeWithin`, `toBeEmpty`                                                    |
| Date              | `toBeAfter`, `toBeBefore`, `toBeBetween`, `toBeValidDate`                                                         |
| Mock              | `toHaveBeenCalledOnce`, `toHaveBeenCalledExactlyOnceWith`, `toHaveBeenCalledBefore`, `toHaveBeenCalledAfter`      |
| Error and promise | `toThrowWithMessage`, `toResolve`, `toReject`                                                                     |

Each matcher also works asymmetrically inside `toStrictEqual` and `toMatchObject`, as in `status: expect.toBeOneOf(['open', 'held'])`.
Upstream leaves `expect.pass` and `expect.fail` unimplemented, so the types leave them out.
---

name: project-testing description: auto-mode's test harness facts on top of the shared testing skill
— the preload, the injected host environment and clocks, git in tests, the default decision and
Messages mocks, and the Claude Code mod checks. Extends the shared testing skill and must be loaded
together with it when designing, writing, or reviewing auto-mode tests.
---

# auto-mode testing

The shared testing skill holds every rule. This skill holds only the facts of auto-mode's own
harness that a test author needs to follow those rules here.

## Running

- `bun run test` builds `dist/` and then runs the suite
  (`bun --no-env-file test --conditions=auto-mode-eval`): one process, files in sequence, the
  `evals` package included. The `--no-env-file` flag keeps a local `.env` out of the run. The
  `auto-mode-eval` condition resolves `auto-mode` to `src/` and opens the `auto-mode/eval` subpath,
  so a bare `bun test evals/…` needs the flag too.
- `bunfig.toml` preloads `@zgeoff/bun-test-extended` (the jest-extended matchers) and
  `test-setup.ts`.
- `test-setup.ts` seeds faker with a fixed value and sets its reference date to a fixed date, so a
  faker date never reads the wall clock. It starts the MSW server with an `onUnhandledRequest`
  callback that lets loopback hosts through and fails every other unmatched request, and after each
  test resets the handlers and clears both reply stores.
- `test-setup.ts` also deletes the `GIT_*` names a git hook exports and the `ATC_*` names an atc
  session exports. The deletion reaches in-process reads and `node:child_process` children only: a
  `Bun.spawn` or `Bun.$` child gets the environment bun started with.

## The host environment

Production never reads `process.env`, `homedir()` or the scratch locations below its entry points.
They arrive as a `HostEnvironment` (`src/config/types.ts`): `{ env, home, scratchPaths? }`.

- `cli.ts` reads the real host once with `readHostEnvironment()` and passes it down. A test builds
  one with `buildMockHostEnvironment` from `test-utils/factories/build-mock-host-environment.ts`:
  its `env` is empty and its `home` does not exist, so a test that reads or writes under home passes
  its temp dir as `home`, and names every variable its case needs in `env`.
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
- `e2e/cli-usage.test.ts`, `e2e/cli-run.test.ts`, `e2e/cli-print-prompt.test.ts` and
  `e2e/cli-fail-closed.test.ts` spawn the built `dist/cli.js` under node with a minimal environment
  rooted in the temp dir. Each fails at once when `dist/cli.js` is missing or node is not 24. Only
  `bun run test` rebuilds `dist/`, so a bare `bun test e2e/…` runs whatever `dist/` already holds.
  The child runs the binary that `node -p process.execPath` resolves, because a version manager's
  node shim needs the user's HOME.
- `src/cli.test.ts` spawns `dist/cli.js` the same way to check the stop-signal wiring. Its config
  names `test-utils/run-stub-key-helper.ts` as the key command, so the child waits for a key and
  sends no request; the test sends the signal once the helper reports on its socket.

## Git

- Run git through `runGit(dir, args)` from `test-utils/run-git.ts`. It gives the child a minimal
  environment: `PATH`, `HOME` set to the temp dir, no global or system config, and a fixed identity.
  A pre-push hook's `GIT_DIR` and the host's signing or template config cannot reach it.
- `readPullRequest` takes the gh command to run. `test-utils/run-stub-gh.ts` stands in for
  `gh pr view`: its first argument names a JSON file of the pull requests it holds.

## Time

- The evaluation path takes `now` and `timeout` in `EvaluationOptions`; the defaults are `Date.now`
  and `AbortSignal.timeout`. The decision and Messages clients take a required `signal`.
- `updateJSONFile` and the state writers built on it take a `LockClock` (`{ now, wait }`).
  `buildStubLockClock` from `test-utils/build-stub-lock-clock.ts` gives one that advances on each
  wait.
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
- The decision handler checks a request as Jev does, and only as far. An unknown top-level field or
  a question type other than `choice` gets HTTP 400 with an `api_usage_error` body. A body that is
  not a JSON object, a missing or wrongly typed `model`, a missing or null `state`, a missing or
  non-map `questions`, an empty `questions` map, and a question that is not an object or has no
  `type` get HTTP 422 with Jev's `detail` list. The value of `state` and the fields inside a
  question pass unchecked, so the client's own tests pin the body it sends.
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
- `evals/corpora/` holds the evaluation corpora, and `evals/corpora/recorded/` the recorded model
  answers the replay suites read; the reports live in the private zgeoff/auto-mode-evals repository.
  The `evals/runners/run-*-evaluation.ts` runners send real model requests, so no test runs one. The
  evaluation suites' helpers and factories live in `evals/lib/`, each with its own tests.

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
- A handler a check registers with `on(…)` must answer synchronously. The host reads a handler that
  returns a promise as no implementation (`HooksError: no implementation for tool.call`).
- The host validates a handler's answer: a `tool.call` answer may not carry `deny` beside `result`,
  and an `agent.spawn` answer needs `model` beside `agentId`.
- The host gives every `$.tool.call` a `tool_use_id` when the check leaves it out, so a check cannot
  reach the mod's path for a tool call without one.
- Every hook gets `next.budget.remainingMs` of 10000 and a signal that is never aborted. Neither the
  test's `timeoutMs` option, `mock.clock`, nor real elapsed time changes them, and `$.tool.check`
  takes one argument. A check cannot reach the mod's "cancelled", "insufficient budget" or
  "insufficient subprocess budget" branches.
- A `tool.check` started from inside a `tool.call` handler reaches the mod only after the call has
  finished, so the mod sees it as an untracked call. A check cannot drive a child agent's
  evaluation: its agent ID, its delegated task, the omitted delegated task, the cleared last direct
  user message, or a delegated task kept across compaction. Nor can it drive a tracked main-agent
  call, the one evaluation whose request carries `toolUseID`. diff --git
  a/evals/lib/build-anonymised-corpus.test.ts b/evals/lib/build-anonymised-corpus.test.ts index
  a10a3ac..01ac76a 100644 --- a/evals/lib/build-anonymised-corpus.test.ts +++
  b/evals/lib/build-anonymised-corpus.test.ts @@ -429,6 +429,19 @@ test.each([ "echo a\\\\\n#
  don't\necho
  \"$(git push origin feat-login)\"\necho 'end'",
     /^echo a\\\\\n# don't\necho "\$\(git push
  origin branch-[0-9a-f]{8}\)"\necho 'end'$/, ],

* [
* 'echo foo\\\n#$(git push origin feat-login)',
* /^echo foo\\\n#\$\(git push origin branch-[0-9a-f]{8}\)$/,
* ],
* ['git push origin feat-\\\n#login', /^git push origin branch-[0-9a-f]{8}\\\nbranch-[0-9a-f]{8}$/],
* [
* 'git push origin feat-login \\\n#retry-later',
* /^git push origin branch-[0-9a-f]{8} \\\n#retry-later$/,
* ],
* [
* 'echo $(git push origin feat-\\\n#login)',
* /^echo \$\(git push origin branch-[0-9a-f]{8}\\\nbranch-[0-9a-f]{8}\)$/,
* ], ['git push origin feat-\\\nlogin', /^git push origin
  branch-[0-9a-f]{8}\\\nbranch-[0-9a-f]{8}$/], ])('it replaces the branch that %j pushes', (command,
  expected) => { const corpus = buildAnonymisedCorpus( diff --git
  a/evals/lib/build-anonymised-corpus.ts b/evals/lib/build-anonymised-corpus.ts index
  a80a96c..0c74875 100644 --- a/evals/lib/build-anonymised-corpus.ts +++
  b/evals/lib/build-anonymised-corpus.ts @@ -402,21 +402,32 @@ function collectCommands(value:
  unknown, key: string | null): string[] { // and after an escaped `\\` the newline stays. const
  LINE_CONTINUATION = /(?<!\\)(?<escapes>(?:\\\\)*)\\\n/g;

+// The shell joins the lines, so a `#` there starts no comment. A NUL, which no +// shell command
holds, keeps the `#` in its word and splits the name instead. +const HASH_CONTINUATION =
/(?<!\\)(?<escapes>(?:\\\\)*)\\\n(?=#)/g; +const JOINED_LINE = '\0'; + // A substitution runs its
own command, so its text is read on its own, and a // grouping bracket that the shell layer keeps on
a word would stick to a branch name. function collectCommandBranches(command: string): Identifier[]
{

- const text = command.replaceAll(LINE_CONTINUATION, '$<escapes> ');

* const text = command
* .replaceAll(HASH_CONTINUATION, `$<escapes>${JOINED_LINE}`)
* .replaceAll(LINE_CONTINUATION, '$<escapes> ');

const substituted = collectSubstitutions(text, 0, null).bodies.flatMap((body) =>
collectCommandBranches(body), );

- return [
- ...substituted,
- ...splitShellCommand(text.replaceAll(/[(){}]/g, ' ')).segments.flatMap((segment) =>
-      collectSegmentBranches(toProgramWords(splitCommandWords(segment.text))),
- ),
- ];

* // After a separator the `#` starts a word, so it opens a comment.
* const words = text.replaceAll(/[(){}]/g, ' ').replaceAll(/(?<=\s)\0/g, '');
*
* const branches = splitShellCommand(words).segments.flatMap((segment) =>
* collectSegmentBranches(toProgramWords(splitCommandWords(segment.text))),
* );
*
* return [...substituted, ...branches].flatMap((branch) =>
* branch.value.split(JOINED_LINE).map((value) => ({ value, kind: branch.kind })),
* ); }

interface SubstitutionScan { @@ -592,6 +603,10 @@ function isWordStart( ): boolean { const previous
= text[index - 1] ?? '';

- if (previous === JOINED_LINE) {
- return isWordStart(text, index - 1, start, substitutionEnd, escapedIndex);
- }
- return ( index === start || (index - 1 !== escapedIndex &&

exec /bin/bash -lc 'cat .claude/skills/code-style/SKILL.md; cat .claude/skills/testing/SKILL.md' in
/root/.local/share/atc/workspaces/auto-mode-main/.worktrees/geo-771 succeeded in 0ms:
---

name: code-style description: Load before writing, reviewing, or renaming any TypeScript in this
repo — every function name must start with a verb from the taxonomy here, and the lint rule
enforcing it reads the same list. Covers module layout and file naming, the function-verb taxonomy
with auto-mode's own verbs, and comments.
---

# Code style

Mechanically enforced rules (oxfmt, oxlint, format-codemod) aren't repeated here — this skill covers
what tooling can't check.

- One primary export per file, and the file name kebab-cases that export (`with-jest-context.ts`
  exports `withJestContext`). Exceptions: `index.ts` entrypoints, `types.ts` for a package's shared
  types, and side-effect-only modules, which are named for what they do (`augment-bun-test.ts`).
- Module order: imports, the primary export, then private helpers in composition order (depth-first)
  — never helpers first. Supporting declarations (consts, interfaces, type aliases) sit directly
  above their first use, never below it and never leading the file; types for the primary export's
  signature may sit just above it.
- Acronyms stay uppercase in identifiers (`runCLI`, `parseCLIArgs`, `ASTNode`, `pkgURL`,
  `isPackageJSON`) — except when one starts a camelCase name, where it lowercases whole (`cliPath`,
  `astNode`). ID counts as an acronym: `userID`, `sessionID` — never `userId` — and `idToken` when
  it starts a name. File names are unaffected: kebab-case lowercases everything (`parse-cli-args.ts`
  exports `parseCLIArgs`).

## Function naming

Every function name starts with a prefix from the closed list below: pick from it, or extend this
skill in the same PR that introduces the new verb. The prefix is a contract — a reader should know
the function's shape without opening it.

**Predicates** — return boolean, no side effects:

| Prefix   | Contract                | Example          |
| -------- | ----------------------- | ---------------- |
| `is`     | type or state test      | `isVarDecl`      |
| `has`    | containment, possession | `hasBlankLine`   |
| `can`    | capability              | `canResize`      |
| `should` | policy decision         | `shouldSkipFile` |
| `needs`  | requirement             | `needsBlankLine` |

**Pure producers** — result comes from arguments alone, no side effects:

| Prefix                        | Contract                                                                  | Example             |
| ----------------------------- | ------------------------------------------------------------------------- | ------------------- |
| `build<Result>[From<Source>]` | default constructor for values; drop `From<Source>` when no single source | `buildEditsFromAST` |
| `define<X>`                   | identity; its only job is compile-time constraint of its literal argument | `defineErrors`      |
| `parse`                       | unstructured input → structure, invalid input reported                    | `parseSource`       |
| `encode`                      | structure → its defined compact or wire form, reversed by `decode`        | `encodeState`       |
| `decode`                      | `encode`'s output → the original structure, malformed input reported      | `decodeState`       |
| `derive`                      | one-way cryptographic derivation from secret material                     | `deriveAvatarKey`   |
| `plan`                        | compute an action without performing it                                   | `planGapEdit`       |
| `pick`                        | select among known alternatives                                           | `pickMode`          |
| `find`                        | search that can miss — null/undefined on miss                             | `findPrevious`      |
| `get`                         | cheap access that cannot miss (throwing on a broken invariant is fine)    | `getNodeEnd`        |
| `collect`                     | gather from a traversal or scan                                           | `collectChildNodes` |
| `count`                       | how many                                                                  | `countNewlines`     |
| `split`                       | one value → parts                                                         | `splitLines`        |
| `merge`                       | parts → one value                                                         | `mergeWindows`      |
| `sort`                        | reorder                                                                   | `sortEdits`         |
| `format`                      | value → human-readable string                                             | `formatRange`       |
| `render`                      | structure → output text or markup                                         | `renderHunk`        |
| `normalize`                   | variant forms → the canonical form                                        | `normalizePath`     |
| `resolve`                     | follow indirection to a concrete value                                    | `resolveBinPath`    |
| `expand`                      | compact form → full form                                                  | `expandInputs`      |
| `compress`                    | value → its reversible compact encoding                                   | `compressGraph`     |
| `decompress`                  | reverse a `compress` encoding (non-encoded shorthand is `expand`)         | `decompressGraph`   |
| `to<Result>`                  | cheap representation change                                               | `toPosixPath`       |
| `transform`                   | a package's own source→source operation                                   | `transform`         |

**Effectful** — touches the world (filesystem, streams, processes, registries):

| Prefix         | Contract                                                                                                                                | Example            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `apply`        | perform previously planned changes                                                                                                      | `applyEdits`       |
| `create`       | bring a resource into existence (file, directory, process)                                                                              | `createWorkDir`    |
| `claim`        | atomically take exclusive ownership of a work item or resource; ownership ends at commit or an explicit release                         | `claimNextChain`   |
| `read`         | pull raw content from filesystem or network into memory                                                                                 | `readSource`       |
| `load`         | read **and** parse into a ready structure                                                                                               | `loadConfig`       |
| `write`        | persist to the filesystem                                                                                                               | `writeOutput`      |
| `remove`       | delete a resource                                                                                                                       | `removeStaleDist`  |
| `update`       | mutate existing state or resource in place                                                                                              | `updateIndex`      |
| `upsert`       | single-statement insert-or-update keyed by a natural or composite key, refreshing the conflicting row's columns in place                | `upsertUser`       |
| `set`          | assign a store's named state slice wholesale — the store-setter idiom; partial mutation is `update`                                     | `setSelectedNode`  |
| `toggle<Flag>` | invert a boolean state slice                                                                                                            | `toggleDevCamera`  |
| `reset`        | return state to its initial value                                                                                                       | `resetCombatState` |
| `print`        | write to stdout/stderr                                                                                                                  | `printHelp`        |
| `run`          | execute a subprocess, task, or whole pipeline                                                                                           | `runCLI`           |
| `check`        | evaluate and report findings; effects allowed per mode                                                                                  | `checkFile`        |
| `try<X>`       | X with failures captured as a value instead of a throw                                                                                  | `tryCheckFile`     |
| `register`     | add to a registry the caller doesn't own                                                                                                | `registerMatcher`  |
| `subscribe`    | attach a listener to an event source, returning or enabling detachment                                                                  | `subscribeToTicks` |
| `unsubscribe`  | detach what `subscribe` attached                                                                                                        | `unsubscribe`      |
| `assert`       | throw when an invariant doesn't hold                                                                                                    | `assertSpan`       |
| `require`      | throw unless a runtime condition holds — a guard real input can trip (`assert` covers invariants)                                       | `requireAuth`      |
| `verify`       | test a claim or credential against evidence, rejecting on mismatch                                                                      | `verifySession`    |
| `emit`         | dispatch an event or notification                                                                                                       | `emitProgress`     |
| `send`         | transmit a payload to a remote receiver (fire-and-forget or RPC — no resource semantics; REST mutations are `create`/`update`/`remove`) | `sendWebhook`      |
| `wait`         | block until an event or condition resolves; may return the awaited value                                                                | `waitForMessage`   |
| `setup`        | prepare the environment or fixture the following code assumes; `teardown` reverses it                                                   | `setupTest`        |
| `teardown`     | release what `setup` prepared                                                                                                           | `teardownTest`     |
| `start`        | put a long-running resource into service (server, worker, poll loop); `stop` reverses it                                                | `startQueues`      |
| `stop`         | take a long-running resource out of service, releasing what `start` acquired                                                            | `stopWorker`       |
| `drain`        | consume a pending backlog until empty                                                                                                   | `drainJobs`        |

**Wrappers and factories** — the result is behaviour, not data:

| Prefix    | Contract                                  | Example           |
| --------- | ----------------------------------------- | ----------------- |
| `with<X>` | HOF that runs a callback inside a context | `withJestContext` |
| `make<X>` | factory whose result is itself a function | `makeExcluder`    |

**Framework conventions** — where the ecosystem's prefix is required, it wins:

| Prefix                   | Contract                                                                                                                | Example          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `use<X>`                 | React hook — the prefix drives rules-of-hooks linting; helpers inside a hook follow the normal taxonomy                 | `useDebounce`    |
| `on<Event>`              | event-callback prop or parameter                                                                                        | `onRowClick`     |
| `handle<Event>`          | local implementation passed to an `on<Event>` prop — the idiomatic React pair; the `handle` ban applies everywhere else | `handleRowClick` |
| `handle<LifecycleEvent>` | implementation of an engine lifecycle callback, keyed by the engine's lifecycle-event enum                              | `handleTick`     |

**Banned** — each is a vaguer or synonymous form of a listed verb; use that one instead: `handle`
(except the `handle<Event>` framework conventions), `process`, `manage`, `do`, `perform` (say what
it does), `execute` (→ `run`), `compute` (→ `build`), `fetch` (→ `read`), `save`/`store` (→
`write`), `delete` (→ `remove`), `search`/`lookup` (→ `find`/`get`).

Algorithm-native vocabulary (`walk`, `backtrack`, `slideDiagonal`) is allowed inside the module
implementing that algorithm — forcing list verbs onto textbook terms hides the algorithm.

### Project verbs

Project additions to the shared taxonomy, declared in `.oxlintrc.json`:

- `classify` — decide which category a value falls into, from a closed set the caller knows
  (`classifyLocally`, `classifySegment`). Distinct from `check`, which reports findings rather than
  returning a category.
- `record` — add what a finished action created to the state a later action reads (`recordScope`).
  Distinct from `write`, which persists a value the caller already holds.

`main` is exempt.

## Comments

- No JSDoc; `zgeoff/no-jsdoc` enforces it. A fact a reader needs belongs in the code, a named
  constant, a test whose name states it, the commit body, or `docs/`.
- A `//` comment holds one thing: the reason the obvious alternative is wrong, when the cause lives
  outside the file — a harness quirk, a library defect, a measured number. Three lines at most.
- Comments describe the code as it is: no history, no project state, and no naming of other
  declarations, which a rename strands.

---

name: testing description: Testing rules for zgeoff repos — the three package regimes, flat
behavioural tests, a setupTest with onTestFinished cleanup, inline data and tested factories, strict
assertions and inline snapshots, controlled time, condition waits, real filesystems and transports,
and the narrow cases for module mocks. References cover real databases, React and TanStack clients,
HTTP mocking with MSW, observability, Claude Code mod checks, and native Go and NixOS conventions.
Load when designing, writing, or reviewing tests.
---

# Testing

`bun test` loads every test file into one process, so state that one file leaves behind is state the
next file sees. The repo's `bunfig.toml` preload owns that process: it registers the matchers, the
mock server lifecycle, and every reset that returns shared state to a clean baseline after each
test. Per-test resources register cleanup with `onTestFinished` where they are acquired. A test
exercises real behaviour through real code, and it reaches for a stand-in only at a boundary the
test cannot cross. When existing tests break these rules, you align them while you work on the code
they cover.

This skill is the shared base that repo-sync delivers from zgeoff/tools: edit it there, never in a
downstream copy. When the repo has a `project-testing` skill, load it as well. That skill adds this
repo's harnesses, regimes, and stricter rules. A project skill never relaxes a rule here; a repo
that needs an exception changes this skill.

A repo that runs the skill gate refuses an edit to a test file until the session that makes it has
loaded the skills the path needs. A subagent loads them itself, because the main session's loads do
not count for it. A compaction clears every load, so load the skills again after one. The gate sees
only Edit, Write and MultiEdit: change a gated file with those tools, never with a Bash redirect,
`tee`, `sed -i`, or a script. The gate does not check Bash, and that gap is accepted, not a way
around the rule.

## Languages and runners

Apply the behavioral principles across languages. The syntax, matchers, hooks, and file conventions
in this file describe Bun tests. For Go, read [Go testing](./references/go.md); for Nix evaluation
and VM tests, read [NixOS testing](./references/nixos.md). Those mappings preserve isolation,
explicit scenarios, independent expectations, real boundaries, and meaningful failures through the
native runner's mechanisms.

## Regimes

Each package falls into one regime, chosen by the furthest edge its code reaches. The regime decides
which reference to open beside this file.

| Regime        | The package                                       | The edge it tests against                           | Reference                                                                  |
| ------------- | ------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------- |
| Pure          | A library or CLI with no service or database edge | Return values, temp directories, the spawned binary | none                                                                       |
| HTTP-mocked   | A client of a remote service, or a web app        | MSW handlers over an in-memory store                | [HTTP mocking](./references/http.md), [frontend](./references/frontend.md) |
| Real database | A service, app, or library that owns a schema     | The real engine, isolated per test                  | [database](./references/database.md)                                       |

Code that records metrics, spans, error reports, or structured logs follows
[observability](./references/observability.md) in any regime. A Claude Code mod's hooks follow
[Claude Code mod checks](./references/claude-code-mods.md), which `claude plugin test` runs instead
of `bun test`.

## Principles

These decide a case that the rules below leave open.

- **Visible beats concise.** A reader understands a test from its body alone. Repeated literals cost
  a few lines; setup the reader cannot see costs a wrong conclusion.
- **Every test stands alone.** A test passes when run by itself, in any order, and beside every
  other test in the process.
- **Behaviour is the contract.** A test pins what the unit does for its callers. A refactor that
  keeps that behaviour, such as a renamed private helper or a reworked loop, leaves every test
  green.
- **Real first, stand-ins at the edge.** Each stand-in marks a spot where the test and production
  can disagree. Use one only for what the test cannot reach, and make it faithful: real status
  codes, real payload shapes, and the production types.
- **Test utilities are code.** A helper that tests depend on lives in the repo's shared test utils
  with its own tests, because a broken helper fails silently in every suite that uses it.
- **The assertion is the test.** A test checks exactly what its assertions check. One loose
  assertion lets a broken unit pass.

## Structure and naming

- Write each test as a top-level `test(…)` call. `describe` is banned: its scope invites shared
  hooks that couple tests, and grouping comes from the file and the title instead.
- A title starts with "it" and reads as verb, outcome, then condition:
  `it rejects a title longer than 120 characters`. It names observable behaviour, never an internal
  identifier, so `it marks the import as failed` and not `it sets status to 2`.
- When one file tests several units, such as the procedures of one router, a `#<unit>` prefix takes
  the place of "it": `#archiveNote rejects a note that is already archived`. A file that tests one
  unit uses no prefix.
- A test body arranges, acts, then asserts. The formatter owns spacing, including gaps between
  phases; keep its layout when it joins statements from different phases. Phase comments such as
  `// act` never appear. An ordinary test acts once: it has one act phase, which may hold several
  calls whose combined result the assertions check, such as the two runs that a determinism test
  compares. A body with two independent act-and-assert pairs holds two tests, so split it. When a
  second act depends on the first, the first act becomes arrangement, as `setupTest` describes. A
  pure function's test may collapse the three phases into one `expect` line.
- `test.each` serves a closed decision table only: rows of plain data, and a title template that
  starts with "it" and interpolates the input that varies or an accurate descriptive label for that
  input. The row supplies the actual values to the test. Any other set of cases gets a separate
  `test()` for each case.
- Tests sit beside the module they test (`parse-entry.ts` and `parse-entry.test.ts`), and a test of
  a program's entry module, such as `cli.ts`, sits beside that module too, so `src/` stays a mirror
  with one test file per module. Two root directories are the exceptions: `e2e/` holds the
  end-to-end suites that run the whole program, and `evals/` holds the
  [evaluation suites](#evaluation-suites). The repo has no other `test/`, `tests/`, or `__tests__`
  directory.

```ts
test.each([
  ['1500ms', 1500],
  ['2s', 2000],
  ['1m', 60_000],
])('it parses %s as %d milliseconds', (input, expected) => {
  expect(parseDuration(input)).toBe(expected);
});
```

### End-to-end suites

An end-to-end suite splits by user journey, one file per journey: `e2e/tui-spawn.test.ts` beside
`e2e/tui-attach.test.ts`. A journey test may chain dependent act-and-assert phases, because each
step of the journey needs the state that the step before it left. Ordinary tests outside `e2e/` act
once. Generated sequences follow [Property tests](#property-tests).

An outer harness may reuse expensive hosts, services, and immutable fixture inputs across journeys.
Each journey keeps its own file, setup, scenario, and cleanup. Reset shared infrastructure to a
clean baseline before each journey; test that the reset removes dirty state, including after failure
or interruption. Recreate the environment when a reset cannot restore the baseline. The harness owns
infrastructure startup and shutdown; test files keep the hook rules in
[Setup and cleanup](#setup-and-cleanup).

Keep command construction importable. Test argument and flag-position cases through the real parser
in module tests; keep binary journeys that check the assembled program.

### Evaluation suites

An evaluation suite in `evals/` checks production code against a committed corpus or report: it
replays a corpus of recorded traffic through the production path, or checks a committed evaluation
report against the code. It tests a corpus, not one module, so it has no module to sit beside.

- The input is the committed corpus or report file, read through one tested loader. The cases are
  never restated as inline literals.
- Helpers live in `evals/test-utils/` with tests of their own. A stand-in replaces only what a
  recording cannot reproduce, such as the disk or the forge, and the suite injects it into the
  production path.
- A deliberate mismatch between the report and the code fails the suite. A suite that passes on a
  stale report checks nothing.
- Every other rule in this skill applies to an evaluation suite.

### Loops

A loop that runs an assertion once per input hides which input failed, and its first failure stops
the rest. Replace it with `test.each`, or write each case as its own test. A loop of `expect` calls
over the items of one result becomes one collection matcher, which reports the whole collection on
failure:

```ts
expect(listOpenNotes(store)).toSatisfyAll((note: Note) => note.archivedAt === null);
```

Two loops that check a set the module owns stay legal:

- A completeness loop that walks a module's own registry, such as checking that every exported
  renderer has a preview.
- A conformance loop that drives each generated case through
  `await expect(conformanceCase.run(app)).toResolve()`.

Neither loop may compute its expectation with the same transformation it checks. A loop that only
arranges, such as inserting 51 rows to cross a page limit, holds no assertion and stays legal.
Prefer `await Promise.all(Array.from({ length: 51 }, …))` when the order of the rows does not
matter.

### Property tests

Use fast-check for generated inputs or operation sequences whose combinations matter. Keep fixed
decision tables in `test.each`. A property runner may dispatch generated operations, branch on
expected outcomes, and check invariants after each operation. These permissions apply inside the
property runner and its operation interpreter; ordinary tests keep their loop, branching, and
single-act rules. Await an async `fc.assert` so a failed property fails the enclosing test.

- Check relevant transitions, not only the final state. Unexpected errors fail the property; an
  expected-outcome branch never suppresses them.
- Derive invariants from an independent contract or a simpler model, never a copy of the production
  algorithm.
- Start each generated case from clean state and release its resources before the next case. Use a
  tested scoped helper for case resources, with cleanup on success and failure. `onTestFinished`
  runs after the enclosing Bun test, not after each generated case; its fallback cleanup alone does
  not isolate cases.
- Preserve the seed, reduced counterexample, and applicable replay information. Add an explicit
  regression test for a discovered sequence when it represents a behavior the suite must keep.
- Keep separate assertions for independent results and tests for behavioral stand-ins. Do not reduce
  generated coverage to conceal slow tests. The interpreter needs no rewrite into command classes
  solely for alignment.

## Setup and cleanup

Process-wide setup and cleanup belong to the preload. Per-test setup belongs to one local function,
`setupTest()`, that the test calls itself. `beforeAll`, `beforeEach`, `afterEach`, and `afterAll`
never appear in a test file.

### `setupTest`

- `setupTest()` builds the runtime the test needs: temp directories, servers, clients, database
  handles, recorders. It takes a typed config object, returns named properties, and has no `if`. Its
  config chooses which dependencies to wire, and it never carries scenario data.
- The scenario belongs to the test body: every row, override, and value that selects the case, such
  as agent entries or authentication tokens. A scenario value stays there even when every test uses
  the same value. `setupTest()` may write boot data without which the unit cannot run; each value
  carries a one-line comment that states why boot needs it.
- Return runtime handles and generated infrastructure paths from `setupTest()` as named properties,
  such as a database handle, a temporary directory, or a VM's system path. They remain runtime
  wiring when a test compares them. Keep the scenario's choice of resource or generation visible in
  the test body.
- An earlier act that the test's one act depends on, such as starting the session that the test
  attaches to, is arrangement. No assertion checks it, because a separate test covers that act.
  `setupTest()` runs it and returns the handles it produced. An earlier act that carries scenario
  data, such as saving the note that the test then archives, stays in the arrange phase of the test
  body instead, because `setupTest()` never carries scenario data. An earlier action that only some
  tests need stays visible in those tests' arrange phase without assertions; do not hide it behind a
  conditional setup flag.
- A test file declares one function, `setupTest()`, and nothing else. A helper the tests want goes
  one of three ways: inline it where it is used, swap it for a registered matcher, or move it to the
  shared test utils with tests of its own. A file with nothing to wire has no `setupTest()`. One
  exception: a collection-time skip gate may keep its awaited probe, and named gates derived from
  it, at module level. Only `skipIf` reads them, each repeated condition is named once, and a
  comment gives the reason: Bun 1.4.2's `skipIf` takes a boolean and has no in-body skip.
- Each test file keeps its own `setupTest()`. A shared one gathers a flag for every suite that uses
  it.

Register cleanup with `onTestFinished` immediately after each successful resource acquisition, so a
later setup step or assertion that throws still releases the resource. `setupTest()` returns named
properties; it adds no disposal symbol solely to forward cleanup. The test holds the result in a
plain `const`.

```ts
async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'notes-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it reads an empty file as no entries', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'entries.txt'), '');

  expect(await readEntries(ctx.dir)).toStrictEqual([]);
});
```

Synchronous acquisition and cleanup keep `setupTest()` synchronous. An async cleanup callback does
not make setup async. Hold the result in one binding and read its members; never destructure it. The
binding names are fixed: `ctx` for `setupTest()`, `hook` for `renderHook(…)`, and `rendered` for
`render(…)`.

### Cleanup

Each kind of state has one cleanup tool.

| State                                                   | Cleanup                                           |
| ------------------------------------------------------- | ------------------------------------------------- |
| A resource that `setupTest()` or the test body acquires | `onTestFinished(…)` immediately after acquisition |
| Process state the test body changes                     | `onTestFinished(…)` immediately after the change  |
| State that a preload reset covers                       | Nothing                                           |

`try`/`finally` never appears in a test. `onTestFinished` runs on failure as well, keeps teardown
beside the acquisition, and needs no `?.` guard for a resource the test never reached. A shared test
util may register `onTestFinished` for its callers. These helpers must run inside a test. A test of
such a helper proves its cleanup ran by asserting in an `onTestFinished` hook. `onTestFinished`
hooks run first-in, first-out, so register that check after the helper's call, and register the
removal of any directory the check reads after the check, not immediately after creating it. This is
the only place an assertion leaves the test body.

When resources have cleanup dependencies, register one callback that closes them in the required
order. Every cleanup must run even if another cleanup throws. Use a disposable stack when reverse
acquisition order matches those dependencies, and register its disposal immediately. Do not hold
that stack with `using` or `await using`, or transfer it with `move()`.

```ts
async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dir = await mkdtemp(join(tmpdir(), 'notes-'));

  stack.defer(() => rm(dir, { recursive: true, force: true }));

  const db = new Database(join(dir, 'notes.db'));

  stack.defer(() => db.close());
  applyNotesMigrations(db);

  return { dir, db };
}
```

If the scenario needs an explicit shutdown before the next action, call it in the test body. Keep
fallback cleanup registered and make it safe after shutdown. Fixture callers need no `using` or
`await using` declaration.

`onTestFinished` runs after all `afterEach` hooks, including the preload's resets. Cleanup uses
captured paths and handles, rather than environment overrides that those resets remove. Tests that
use this hook run sequentially within each file: do not enable `test.concurrent`, `--concurrent`, or
`concurrentTestGlob` for them. Separate worker processes and CI jobs can still run in parallel.

```ts
test('it reads a note written by another connection', async () => {
  const ctx = await setupTest();

  const writer = new Database(join(ctx.dir, 'notes.db'));
  onTestFinished(() => writer.close());

  writer.run(`INSERT INTO notes (title) VALUES ('from writer')`);

  expect(listNoteTitles(ctx.db)).toStrictEqual(['from writer']);
});
```

A test overrides an environment variable through the repo's env util, and the preload restores every
override after each test. A test never assigns `process.env` directly. A test never relies on a
unique key to avoid another test's rows: isolation comes from resets, not from luck.

### A test that fails only in the full run

A test that passes alone and fails beside others has found a cleanup gap. Find it this way:

1. Run the failing test alone, and confirm it passes.
2. Run it with half of the other test files, and keep halving toward the half that still makes it
   fail.
3. In the file that remains, find the state it leaves behind: a module cache, a singleton, a store,
   an unrestored override.
4. Add that state's reset to the preload.

Reordering the tests or choosing unique keys hides the gap and leaves it for the next test to find.

## Test data

- Plain inputs stay inline at the call site: arguments, options bags, config values. Write the
  literal again in the next test. A module-level fixture, a baseline object shared between tests, or
  a constant that only names a literal (`const EMPTY = ''`) never appears in a test file.
- A domain type that crosses a module boundary gets a factory, `build-mock-<type>.ts` exporting
  `buildMock<Type>`, in the shared test utils as soon as a test needs one. A factory returns a value
  and brings no resource into existence, so it takes the `build` prefix from the repo's
  function-naming table. A composite that writes rows creates a resource and keeps `create`. A type
  that another package owns, such as an SDK result, is in the same position on first use. A type
  private to the module under test stays an inline literal.
- A factory returns a complete plain object. Fields whose value is arbitrary default to
  `@faker-js/faker` values, which prove the unit does not depend on one particular value.
  Constrained fields, such as an enum or a discriminator, take a fixed default. A deterministic
  package, whose outputs are pinned as golden values, takes fixed defaults throughout. The preload
  seeds faker once, so a failing run reproduces.
- A factory defaults each foreign key to a fresh id and never requires a parent. Wiring real parents
  is a composite's job.
- A factory for a class returns an instance of that class, so `toStrictEqual` against a real
  instance passes. A factory with nested fields deep-merges each override into fresh defaults.
- A row factory returns the table's insert shape, and a contract factory returns the API type. They
  are separate factories, kept in the packages that own each shape.
- Each factory has a test file with at least two tests: `it builds a default <type>`, which asserts
  the whole shape with `toStrictEqual` and asymmetric matchers, and
  `it applies overrides on top of the defaults`. Add a test only for a factory branch that those two
  cannot reach, such as an override that leaves out an optional field (`undefined` meaning absent),
  a field derived from another field, or a keyed or nested override that builds each child from its
  own factory. Each added test fails when that branch is deleted. Never add one that checks faker's
  output or the plain merge of overrides again.
- The test that uses a factory's value calls the factory itself. A helper that presets overrides is
  a second set of defaults that the reader cannot see.
- A runtime stand-in that implements behaviour or assumptions about a dependency lives in the shared
  test utils under a name for what it impersonates. Its prefix follows the repo's function-naming
  table. A stand-in that starts something long-running, such as a stub server, is
  `start-stub-<thing>.ts`. A stand-in that creates a resource, such as a stub repository on disk, is
  `create-stub-<thing>.ts`. Every other stand-in is `build-stub-<thing>.ts`. It has its own tests,
  which pin the assumptions it makes about the real thing. An executable stand-in script uses
  `run-stub-<thing>.ts`; an imported helper that starts it keeps `start-stub-<thing>.ts`.
- Keep bare call recorders (`mock()` with no implementation) and no-op callbacks (`() => {}`)
  inline, including a recorder inside an object such as `{ sendEvent: mock() }`. Never extract a
  wrapper or add a test whose only purpose is to check that the mocking library records calls. A
  no-op executable placeholder stays inline through the shared file helper when the test needs only
  an executable. Extract a dedicated stand-in when the script models arguments, output, or failures.

### Composites

A composite assembles one domain concept from factories and persistence helpers: a signed-in user
with its session, or an order with its customer. It creates each dependency that the caller does not
pass, and it returns data, never clients, apps, or servers.

- A composite's name is a concept the system already names. Two readers who see just the name
  describe the same contents. A name that lists its parts, such as
  `createUserWithTwoNotesAndAShare`, is a convenience grouping: compose the primitives in the test
  instead.
- A variant is a separate file and export, such as `createAdminUser` beside `createUser`. It is
  never a flag inside one composite.
- A composite has no batch form. Several records are several calls.

## Schemas and parsers

- Feed a parser or a validator inline literal payloads: ones it accepts and ones it rejects. A
  factory produces values built to pass the schema, so its output cannot show the schema rejecting
  anything.
- A rejection payload repeats the complete valid literal and alters a single field, so the reader
  sees which field causes the rejection.
- A rejection test asserts the path of the reported issue, in one shape, because a payload can be
  invalid for many reasons and `success: false` passes for all of them:

  ```ts
  expect(result.error?.issues).toPartiallyContain({ path: ['title'] });
  ```

  Pass the expected partial object directly. Never read `issues[0]`, which ties the test to issue
  order.

- An acceptance test asserts `result.data`. For a schema that passes values through, assert
  `toStrictEqual(payload)`. For one that transforms, assert the transformed value. A bare
  `success: true` passes for a schema that strips or coerces a field wrongly.

## Assertions

- Use `toStrictEqual` when the test determines every field of the expected value: the full shape is
  the contract. When the value carries fields that the test does not determine, such as faker
  defaults, timestamps, or generated ids, use asymmetric matchers inside `toStrictEqual`, or
  `toMatchObject`. Choosing a partial match because the full literal is long is a defect. `toEqual`
  never appears.
- Assert each result on its own. Never assemble unrelated results or observations into an object
  only to put them under one `toStrictEqual`. A normalized projection of one result, such as a
  command's exit code, stdout, and stderr, stays together. A later request's status is a separate
  assertion. Independently meaningful scalar checks use separate `toBe` calls.
- Derive an expected value from the contract, independently of the unit's own calculation. For a
  filesystem path, use a known package or fixture root plus the explicit expected location, rather
  than repeating the unit's relative path expression. Keep a behaviour check where it proves the
  derived value works.
- A recovery test checks that the injected fault occurred and that recovery succeeded. Capture the
  earlier state during arrangement, then assert it at the end alongside the final state; use
  separate scalar assertions for each state.
- After a mutation, one `toBe` on the field that changed is enough.
- Snapshots are inline only. `toMatchInlineSnapshot` pins a golden value: deterministic machine
  output that no person derives by reading the code, such as a generated SQL string or a rendered
  report. A value a person wrote by hand, such as a spec test vector, keeps an explicit matcher,
  because a snapshot of it would bless whatever the code produced. File snapshots and component
  snapshots never appear.
- A deterministic pipeline's suite opens with two tests. A frozen-golden test feeds one hand-written
  literal input and pins the full output inline. A determinism test asserts that the same input
  gives equal outputs: `expect(run(input)).toStrictEqual(run(input))`. The golden input is never a
  factory call, because regenerating snapshots must never change the input.
- A stand-in's derived values, such as a fake hash or a fake signature, are not contract. Assert
  their properties: their shape, that the same input gives the same output, and that different
  inputs give different outputs.
- A sweep that deletes resources has a test that names what it never touches, such as
  `it never removes another owner's files`.

### Errors

- Assert an error at the strictness its contract needs: `toThrow()` when only the throw matters,
  `toThrowWithMessage(Error, /…/)` when the message is contract, and `toMatchObject({ code })` when
  the error carries a typed code. An inline snapshot pins the whole error when its full text is a
  golden value.
- Each error that a unit declares has its own test.
- A `try`/`catch` never asserts an error: when the call does not throw, the assertion never runs.
- `bun-types` declares `.rejects` and `.resolves` as synchronous matchers, and Bun settles the
  promise inside the matcher. Write these chains without `await`. `toResolve()` and `toReject()`
  return a promise: always `await` them.

```ts
test('it rejects a note owned by another user', async () => {
  const ctx = await setupTest();

  const note = await saveNote(ctx.db, { ownerID: 'user_a', title: 'private' });

  expect(readNote(ctx.db, { noteID: note.id, userID: 'user_b' })).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
});
```

### Authorisation pairs

An access rule lands with two tests: the allowed caller succeeds, and the other caller is refused.
The refused case names the other caller in its title, such as
`it rejects a note owned by another user`. A read path that hides a record instead of refusing
asserts the hidden result, such as `toBeNull()`.

### Narrowing and branching

An ordinary test body never branches. Each path through the unit gets its own test. Generated
operation dispatch follows [Property tests](#property-tests).

Narrow a value that may be missing with `invariant(value)` or an explicit `throw` on the line before
the assertion. Optional chaining inside `expect` is safe when the matcher fails on `undefined`,
because a missing value then fails loudly:

```ts
expect(result.data?.title).toBe('groceries');
```

Four matchers pass on `undefined`: a `.not` matcher, `toBeUndefined`, `toBeFalsy`, and `toBeNil`.
With those, `?.` or `??` turns a missing value into a pass, so narrow first:

```ts
invariant(result.data);
expect(result.data.error).toBeUndefined();
```

When you are unsure which kind a matcher is, narrow.

An assertion inside an ordinary callback passes when the callback never runs. Copy the value out of
the callback into a variable, then assert on it once the call returns. Property-runner assertions
follow [Property tests](#property-tests).

## Time and waiting

Control time in the most explicit form the code allows:

1. **A time argument.** Code that advances through time takes the duration or the timestamp as a
   parameter: `scheduler.advance(30_000)`.
2. **An injected clock.** Code with its own loop or timers takes a `now` function or a clock object,
   and the test steps it.
3. **Fake timers.** Code with no injection point, such as a third-party library, gets
   `setSystemTime()` and fake timers. The test restores them in `onTestFinished`.

A Claude Code mod reads the wall clock and never the host's clock, for the reason in
[Claude Code mod checks](./references/claude-code-mods.md#time).

A value that depends on the wall clock is built relative to `Date.now()`
(`expiresAt: new Date(Date.now() - 1000)`) and asserted with range matchers such as `toBeAfter` and
`toBeWithin`, never with an exact timestamp.

A test waits on a condition with a polling `waitFor`, never with a sleep. A sleep makes the suite
slower by its full length on every run, and it still fails on a slow machine. When the code offers
nothing observable to wait on, the code lacks a signal: add one, such as an event, a log marker, or
a state flag, and wait on that.

### Native timers and scenario delays

A test of a native runtime or kernel timer uses the shortest faithful configurable deadline through
the real mechanism. Configure startup-only settings in an isolated child process. Include a failure
control that proves an unprotected operation crosses the deadline; a nominal timeout value alone
does not prove expiry. Keep default configuration coverage separate. Wait out the real default only
when the runtime cannot expose a shorter faithful deadline, and run that case through an explicit
script.

When a third-party library owns a timer, runs it internally, and takes only a duration in its
config, pass the shortest duration the library accepts and wait on the observable event, never with
a sleep. Add a control: the same duration with a live peer does not fire. Fake timers stay for
libraries whose timers do not interleave with real I/O.

A real delay may define an end-to-end workload rate or a seeded fault-injection offset. State the
rate or fault purpose and preserve replay information. A claim that a fault lands mid-operation
needs evidence of overlap and checks of the fault and recovery. Use phase-targeted checks for known
races. A delay that only guesses when a service settles remains a condition wait; elapsed age must
matter to the contract to justify a dwell.

## Boundaries

Stand-ins replace a boundary, never the code inside it. A test never stubs `fetch`, an HTTP client,
or a method of the unit's own services: the path from the call to the boundary runs for real,
including serialisation and error handling.

| Boundary                                       | The test uses                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| Pure computation                               | Return values, with no stand-in                                                       |
| A CLI                                          | The real binary, spawned end to end                                                   |
| The filesystem                                 | A real `mkdtemp` tree per test                                                        |
| A database                                     | The real engine, isolated per test, as [database](./references/database.md) describes |
| A remote HTTP or RPC service                   | MSW handlers, as [HTTP mocking](./references/http.md) describes                       |
| A service with a cheap container               | The real service in a container                                                       |
| An SDK with a command layer                    | A stand-in at the command layer                                                       |
| A queue or pub/sub without a faithful emulator | A wrapper with queryable state, as [HTTP mocking](./references/http.md) describes     |

A module that is hard to test without a stand-in takes its I/O from its caller: test the pure core
with values, and test the I/O edge against the real boundary.

### Real applications and transport

A CLI, SDK, or server-side client of a service in the same repo tests against the real application
wiring, with isolated data and stand-ins at host boundaries the runtime cannot run. A child process
reaches that application through a real listener. Frontend component tests keep the MSW boundary in
[frontend testing](./references/frontend.md), with the real SDK and RPC serialization.

Use a tested real network stand-in where interception cannot exercise the contract: certificate
verification, TLS or tunnel behavior, Unix sockets whose native options interception loses, or
requests from a child process, container, or VM outside the intercepted process. Confirm a claimed
interceptor limitation with the installed versions. Keep real routing and serialization,
schema-backed rich mock state, and visible failures for unexpected calls. Ordinary remote HTTP
behavior keeps MSW where it applies.

### Filesystem

A real temp tree costs about 1 to 2 ms per test for a handful of small files, and more as the tree
grows. A test pays that for real behaviour: `fs.watch`, permissions, symlinks, `Bun.file`, and
`Bun.write`, which an in-memory filesystem fakes or misses. Take every path from the temp root and
pass it into the module. Never steer a module through `process.cwd()` or through a `HOME` value set
after startup, because Bun reads some of those once at startup.

### Program-fixed paths and global resources

Kernel or program contracts may impose a path inside the test environment, such as a certificate
trust directory, procfs, or a VM mount point. State which contract fixes it. Use a fresh test-owned
namespace or resource with checked ownership; choose a disposable environment when ownership cannot
be guaranteed. Each test creates fresh scenario resources and cleans them up.

Distinct names for machine-global resources allocate a namespace, like `mkdtemp`; they never replace
row or store isolation. Refuse collisions with resources this run does not own before overwriting,
truncating, mounting, or deleting them. Register cleanup immediately after successful acquisition,
and release only what this run acquired. A generated name is not proof of ownership. Cleanup remains
safe after partial failure, interruption, and explicit shutdown.

### Infrastructure failures

A failure branch runs on a real failure:

- A database or socket that is down: point the real driver at an address where nothing listens, and
  destroy the handle in `onTestFinished`.
- A downstream service that errors: a per-test MSW handler that throws or returns the error status.
- One statement that fails in the middle of a flow: real state that makes it fail, such as a
  conflicting row for a constraint, or a held lock with a short `lock_timeout`.

A spy that makes one method of a real object reject never appears. A branch that neither a dead
transport nor real state can reach shows a missing injection point: put that dependency behind an
injected boundary.

### Module mocks

`mock.module` never appears in a test file. In one process, a module mock in one file applies to
every file that loads after it. Two kinds of module mock are legal, and each lives in a preload
module named `register-<module>-mock.ts`:

- **A stand-in for what the test runtime cannot host**, such as a WebGL scene, a `SharedWorker`, or
  a framework's ambient server context. It reads from a stub store, and one exported setter is the
  only way a test changes that store.
- **A wrapper that a library documents for testing**, which keeps the real behaviour and adds one
  hook, such as the store reset that `@zgeoff/bun-test-react/zustand` installs.

Any other module mock is banned, auto-mocking included. A module mocked because of what it imports
shows a defect in the import graph: fix the import graph instead.

## Matchers

The `@zgeoff/bun-test-extended` preload registers the jest-extended matchers, and a package's
`augment-bun-test.ts` import gives `tsc` their types. Typecheck fails on a matcher name that does
not exist. Prefer a matcher to a hand-written check:

| Value             | Matchers                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| Array             | `toIncludeAllMembers`, `toIncludeSameMembers`, `toIncludeAllPartialMembers`, `toPartiallyContain`, `toSatisfyAll` |
| Object            | `toContainEntry`, `toContainEntries`, `toContainAllKeys`, `toBeFrozen`                                            |
| String            | `toStartWith`, `toEndWith`, `toInclude`, `toEqualCaseInsensitive`, `toEqualIgnoringWhitespace`                    |
| Any value         | `toBeNil`, `toBeOneOf`, `toSatisfy`, `toBeWithin`, `toBeEmpty`                                                    |
| Date              | `toBeAfter`, `toBeBefore`, `toBeBetween`, `toBeValidDate`                                                         |
| Mock              | `toHaveBeenCalledOnce`, `toHaveBeenCalledExactlyOnceWith`, `toHaveBeenCalledBefore`, `toHaveBeenCalledAfter`      |
| Error and promise | `toThrowWithMessage`, `toResolve`, `toReject`                                                                     |

Each matcher also works asymmetrically inside `toStrictEqual` and `toMatchObject`, as in
`status: expect.toBeOneOf(['open', 'held'])`. Upstream leaves `expect.pass` and `expect.fail`
unimplemented, so the types leave them out.

exec /bin/bash -lc "sed -n '1,230p' evals/lib/build-anonymised-corpus.ts; sed -n '380,760p'
evals/lib/build-anonymised-corpus.ts; head -40 .scratch/codex-review.md" in
/root/.local/share/atc/workspaces/auto-mode-main/.worktrees/geo-771 succeeded in 0ms: import {
createHmac } from 'node:crypto'; import { basename } from 'node:path'; import { findSecret,
splitCommandWords, splitGitCommand, splitShellCommand } from 'auto-mode/eval';

export interface CapturedAction { readonly cwd: string; readonly request: unknown; readonly verdict:
unknown; readonly decidingStage: string; }

interface AnonymisedCase { readonly id: string; readonly source: 'recorded'; readonly request:
unknown; readonly recordedVerdict: unknown; readonly decidingStage: string; }

export interface AnonymisedCorpus { readonly schemaVersion: 1; readonly cases: readonly
AnonymisedCase[]; }

// The salt keys every placeholder, so one corpus maps a value to one // placeholder while a corpus
built with another salt cannot be joined to it. export function buildAnonymisedCorpus( actions:
readonly CapturedAction[], salt: string, ): AnonymisedCorpus { const identifiers =
collectIdentifiers(actions); const rewrite = makeStringRewriter(identifiers, salt);

return { schemaVersion: 1, cases: actions.map((action, index) => ({ id:
`recorded-${String(index + 1).padStart(4, '0')}`, source: 'recorded', request:
toAnonymisedValue(action.request, null, rewrite, salt), recordedVerdict:
toAnonymisedValue(action.verdict, null, rewrite, salt), decidingStage: action.decidingStage, })), };
}

type IdentifierClass = 'user' | 'host' | 'owner' | 'repo' | 'branch';

interface Identifier { readonly value: string; readonly kind: IdentifierClass; }

const HOME_PATH =
/\/(?<base>home|Users)\/(?<user>[^/\s"'`:;|&<>()]+)/g; const WINDOWS_HOME = /\b(?<prefix>[A-Za-z]:[\\/]+Users[\\/]+)(?<user>[^\\/\s"'`:;|&<>()]+)/g;

const FORGE_PATH =
/\b(?:github\.com|gitlab\.com|bitbucket\.org|codeberg\.org)[/:](?<owner>[\w.-]+)\/(?<repo>[\w.-]+)/gi;

const REPO_FLAG = /(?:--repo|-R)[=\s]+(?<owner>[\w.-]+)\/(?<repo>[\w.-]+)/g;

const URL_AUTHORITY =
/\b(?<scheme>[a-z][a-z0-9+.-]*:\/\/)(?:(?<userinfo>[^\s/@"'<>]+)@)?(?<host>[A-Za-z0-9.-]+)(?<port>:\d+)?(?:\/(?<first>[^\s/?#"'<>]+)(?:\/(?<second>[^\s/?#"'<>]+))?)?/gi;

const QUERY_VALUE = /(?<prefix>[?&][\w.~-]+=)(?<value>[^&#\s"'<>]+)/g;

const SECRET_FLAG =
/(?<flag>--(?:password|passwd|pass|token|secret|api-key|apikey|auth|auth-token)(?:=|\s+))(?<value>[^\s"'&;|]+)/gi;

const ATTACHED_PASSWORD = /(?<flag>(?<![\w-])-p)(?<value>[^\s"'&;|]_[A-Za-z][^\s"'&;|]_)/g; const
IPV4 = /(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])/g; const IPV6 =
/(?<![\w:])[0-9A-Fa-f]{0,4}(?::[0-9A-Fa-f]{0,4}){2,7}(?![\w:])/g;

const KEPT_ADDRESSES = new Set(['127.0.0.1', '0.0.0.0', '::1', '::', 'localhost']);

const DOTTED_NAME =
/(?<![\w.@/\\-])(?<host>[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+)(?![\w-]|\.\w)/g;

const HOST_POSITION =
/\b(?:ssh|scp|rsync|sftp|mosh|ping|telnet|nc|dig|nslookup|curl|wget)\b[^;&|\n]*?(?<=\s)(?:[\w.-]+@)?(?<host>[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;

const HOST_FLAG = /(?:--host|-h|-H)[=\s]+(?<host>[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;

// Top-level and private suffixes that mark a dotted name as a host; a file // extension wins over a
suffix, so `install.sh` and `README.md` stay names. const HOST_SUFFIXES = new Set([ 'com', 'net',
'org', 'io', 'dev', 'app', 'ai', 'co', 'uk', 'de', 'fr', 'nl', 'eu', 'us', 'ca', 'au', 'jp', 'cn',
'ru', 'br', 'ch', 'se', 'no', 'fi', 'dk', 'pl', 'it', 'es', 'be', 'at', 'cz', 'info', 'biz', 'me',
'tv', 'cloud', 'tech', 'site', 'xyz', 'gov', 'edu', 'internal', 'local', 'lan', 'corp', 'home',
'intranet', 'private', 'localdomain', 'test', 'tld', ]);

const FILE_EXTENSIONS = new Set([ 'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'jsonl', 'md',
'mdx', 'txt', 'yml', 'yaml', 'toml', 'lock', 'sh', 'bash', 'zsh', 'py', 'go', 'rs', 'rb', 'java',
'kt', 'c', 'h', 'cpp', 'css', 'scss', 'html', 'svg', 'png', 'jpg', 'gif', 'log', 'csv', 'sql',
'env', 'tar', 'gz', 'zip', 'pdf', 'nix', 'xml', 'ini', 'cfg', 'conf', 'pem', 'key', 'crt', 'diff',
'patch', ]);

const SCP_REMOTE = /\b(?<user>[\w.-]+)@(?<host>[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+):/g; const EMAIL =
/\b[\w.+-]+@(?<host>[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)\b/g;

const BRANCH_PATTERNS = [ /\b(?:checkout|switch)\s+-[bBcC]\s+(?<branch>[^\s;&|'"]+)/g,
/\bworktree\s+add\b[^;&|\n]*?\s-[bB]\s+(?<branch>[^\s;&|'"]+)/g,
/\bbranch\s+(?:-[dDmMf]+\s+)+(?<branch>[^\s;&|'"]+)/g,
/\s--(?:head|base)[=\s]+(?<branch>[^\s;&|'"]+)/g, /\.worktrees\/(?<branch>[^/\s"']+)/g, ];

const SHARED_USERS = new Set(['git', 'x-access-token', 'oauth2', 'token']);

// Names that carry the shape of an action rather than who ran it; replacing // them would hide the
structure the corpus exists to keep. const STRUCTURAL_NAMES = new Set([ 'main', 'master', 'trunk',
'develop', 'head', 'origin', 'upstream', 'src', 'lib', 'app', 'apps', 'packages', 'docs', 'test',
'tests', 'tmp', 'dist', 'build', 'home', 'users', 'root', }

// Prose and file content mention `git push` and the words after it, and every // name collected
here is replaced wherever it appears, so only a shell // command, the value of a `command` field,
names the branches it pushes. function collectCommands(value: unknown, key: string | null): string[]
{ if (typeof value === 'string') { return key === 'command' ? [value] : []; }

if (Array.isArray(value)) { return value.flatMap((item: unknown) => collectCommands(item, null)); }

if (typeof value === 'object' && value !== null) { return Object.entries(value).flatMap(([field,
item]) => collectCommands(item, field)); }

return []; }

// A space keeps both halves of a branch name split by `\<newline>` for the rewriter, // and after
an escaped `\\` the newline stays. const LINE_CONTINUATION = /(?<!\\)(?<escapes>(?:\\\\)*)\\\n/g;

// The shell joins the lines, so a `#` there starts no comment. A NUL, which no // shell command
holds, keeps the `#` in its word and splits the name instead. const HASH_CONTINUATION =
/(?<!\\)(?<escapes>(?:\\\\)*)\\\n(?=#)/g; const JOINED_LINE = '\0';

// A substitution runs its own command, so its text is read on its own, and a // grouping bracket
that the shell layer keeps on a word would stick to a branch name. function
collectCommandBranches(command: string): Identifier[] { const text = command
.replaceAll(HASH_CONTINUATION, `$<escapes>${JOINED_LINE}`) .replaceAll(LINE_CONTINUATION,
'$<escapes> ');

const substituted = collectSubstitutions(text, 0, null).bodies.flatMap((body) =>
collectCommandBranches(body), );

// After a separator the `#` starts a word, so it opens a comment. const words =
text.replaceAll(/[(){}]/g, ' ').replaceAll(/(?<=\s)\0/g, '');

const branches = splitShellCommand(words).segments.flatMap((segment) =>
collectSegmentBranches(toProgramWords(splitCommandWords(segment.text))), );

return [...substituted, ...branches].flatMap((branch) => branch.value.split(JOINED_LINE).map((value)
=> ({ value, kind: branch.kind })), ); }

interface SubstitutionScan { readonly bodies: string[]; readonly end: number; }

interface Heredoc { readonly delimiter: string; readonly isQuoted: boolean; readonly stripsTabs:
boolean; }

const HEREDOC = /^<<(?<strip>-?)[ \t]*(?<word>[^\s<>;&|()]+)/;

// The shell runs no substitution inside single quotes, after a backslash, in a // comment or in a
quoted heredoc. A quote or bracket that never closes is read // as one literal character, because
stopping there would leak a later push. function collectSubstitutions( text: string, start: number,
closer: ')' | '}' | null, ): SubstitutionScan { const bodies: string[] = []; const heredocs:
Heredoc[] = []; const isExpansion = closer === '}'; const opener = isExpansion ? '{' : '('; let
isDoubleQuoted = false; let depth = 0; let substitutionEnd = -1; let escapedIndex = -1; let index =
start;

while (index < text.length) { const char = text[index] ?? '';

    if (char === '\\') {
      escapedIndex = index + 1;
      index += 2;
      continue;
    }

    // A `${…}` opens its own quoting, so a quote inside it closes no outer quote.
    if (text.startsWith('${', index)) {
      const expansion = collectSubstitutions(text, index + 2, '}');

      bodies.push(...expansion.bodies);

      index = expansion.end === -1 ? index + 1 : expansion.end + 1;
      continue;
    }

    if (char === '`' || text.startsWith('$(', index)) {
      const substitution = findSubstitution(text, index);

      if (substitution !== null) {
        bodies.push(substitution.body);

        substitutionEnd = substitution.end;
      }

      index = substitution === null ? index + 1 : substitution.end + 1;
      continue;
    }

    if (char === '\n' && heredocs.length > 0 && !isDoubleQuoted) {
      for (const heredoc of heredocs.splice(0)) {
        const [bodyEnd, next] = getHeredocEnd(text, index + 1, heredoc);

        if (!heredoc.isQuoted) {
          bodies.push(...collectHeredocSubstitutions(text.slice(index + 1, bodyEnd)));
        }

        index = next;
      }

      continue;
    }

    if (char === '"') {
      isDoubleQuoted = !isDoubleQuoted;
    } else if (!isDoubleQuoted) {
      if (isExpansion) {
        // Quotes, comments and heredocs do not apply inside an expansion.
      } else if (char === "'") {
        const end = findSingleQuoteEnd(text, index, isANSIQuote(text, index));

        index = end === -1 ? index : end;
      } else if (char === '#' && isWordStart(text, index, start, substitutionEnd, escapedIndex)) {
        const newline = text.indexOf('\n', index);

        index = (newline === -1 ? text.length : newline) - 1;
      } else if (text.startsWith('<<<', index)) {
        index += 2;
      } else if (text.startsWith('<<', index)) {
        const match = HEREDOC.exec(text.slice(index));

        if (match !== null) {
          heredocs.push(toHeredoc(match.groups?.['word'] ?? '', match.groups?.['strip'] === '-'));

          index += match[0].length - 1;
        }
      }

      if (char === opener) {
        depth += 1;
      } else if (char === closer) {
        if (depth === 0) {
          return { bodies, end: index };
        }

        depth -= 1;
      }
    }

    index += 1;

}

return { bodies, end: -1 }; }

function findSubstitution(text: string, index: number): { body: string; end: number } | null { const
isBacktick = text[index] === '`'; const bodyStart = index + (isBacktick ? 1 : 2);

const end = isBacktick ? findBacktickEnd(text, bodyStart) : collectSubstitutions(text, bodyStart,
')').end;

return end === -1 ? null : { body: text.slice(bodyStart, end), end }; }

// The shell ends a backtick body at the first unescaped backtick, before it reads any quote.
function findBacktickEnd(text: string, start: number): number { for (let index = start; index <
text.length; index += 1) { if (text[index] === '\\') { index += 1; } else if (text[index] === '`') {
return index; } }

return -1; }

// An escaped `\$` or the `$$` parameter before a quote does not start `$'…'`. function
isANSIQuote(text: string, index: number): boolean { return text[index - 1] ===
'$' && !/[\\$]/.test(text[index - 2] ?? ''); }

// `$'…'` lets a backslash escape the closing quote; a plain single quote does not. function
findSingleQuoteEnd(text: string, start: number, allowsEscapes: boolean): number { for (let index =
start + 1; index < text.length; index += 1) { if (allowsEscapes && text[index] === '\\') { index +=
1; } else if (text[index] === "'") { return index; } }

return -1; }

// A `)` that closes a subshell ends a word, but one that closes a substitution // leaves the word
open, so `$(…)#L1` holds no comment. An escaped separator // belongs to the word, so `foo\ #` holds
no comment either. function isWordStart( text: string, index: number, start: number,
substitutionEnd: number, escapedIndex: number, ): boolean { const previous = text[index - 1] ?? '';

if (previous === JOINED_LINE) { return isWordStart(text, index - 1, start, substitutionEnd,
escapedIndex); }

return ( index === start || (index - 1 !== escapedIndex && (/[\s;&|(<>]/.test(previous) || (previous
=== ')' && index - 1 !== substitutionEnd))) ); }

// Any quoted character in the word quotes the whole delimiter and turns // substitution off for the
body. function toHeredoc(word: string, stripsTabs: boolean): Heredoc { return { delimiter:
word.replaceAll(/['"\\]/g, ''), isQuoted: /['"\\]/.test(word), stripsTabs, }; }

// A body with no closing delimiter runs to the end of the command. function getHeredocEnd(text:
string, bodyStart: number, heredoc: Heredoc): [number, number] { let lineStart = bodyStart;

while (lineStart < text.length) { const newline = text.indexOf('\n', lineStart); const lineEnd =
newline === -1 ? text.length : newline; const line = text.slice(lineStart, lineEnd);

    if ((heredoc.stripsTabs ? line.replace(/^\t+/, '') : line) === heredoc.delimiter) {
      return [lineStart, lineEnd];
    }

    lineStart = lineEnd + 1;

}

return [text.length, text.length]; }

// Quotes are literal in a heredoc body, so only a backslash and a substitution count. function
collectHeredocSubstitutions(body: string): string[] { const bodies: string[] = []; let index = 0;

while (index < body.length) { const char = body[index] ?? '';

    if (char === '\\') {
      index += 2;
    } else if (char === '`' || body.startsWith('$(', index)) {
      const substitution = findSubstitution(body, index);

      if (substitution !== null) {
        bodies.push(substitution.body);
      }

      index = substitution === null ? index + 1 : substitution.end + 1;
    } else {
      index += 1;
    }

}

return bodies; }

const COMMAND_PREFIXES = new Set([ '!', 'if', 'then', 'else', 'elif', 'while', 'until', 'do',
'time', 'exec', 'nohup', 'xargs', 'sudo', 'command', ]);

const VALUED_PREFIX_OPTIONS = new Set(['-u', '-g', '-n', '-I']);

// A comment ends the command, and a wrapper's options come before the program. function
toProgramWords(words: readonly string[]): readonly string[] { const comment = words.findIndex((word)
=> word.startsWith('#')); const command = comment === -1 ? words : words.slice(0, comment); let
index = 0;

while (index < command.length) { const word = command[index] ?? ''; const isPrefixOption =
word.startsWith('-');

    if (!COMMAND_PREFIXES.has(word) && !/^\w+=/.test(word) && !isPrefixOption) {
      break;
    }

    index += isPrefixOption && VALUED_PREFIX_OPTIONS.has(word) ? 2 : 1;

}

return command.slice(index); }

const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash']);

function collectSegmentBranches(words: readonly string[]): Identifier[] { const [program = '',
...args] = words; const script = args.findIndex((arg) => /^-\w*c\w*$/.test(arg));

if (SHELLS.has(basename(program)) && script !== -1) { return collectCommandBranches(args[script + 1]
?? ''); }

if (basename(program) !== 'git') { return []; }

const [subcommand, ...rest] = splitGitCommand(args, null, '').args;

return subcommand === 'push' ? collectPushedBranches(rest) : []; }

// The first operand names the remote; every later one is a refspec whose // sides name branches.
function collectPushedBranches(args: readonly string[]): Identifier[] { const [, ...refspecs] =
args.filter((arg) => !arg.startsWith('-'));

return refspecs.flatMap((refspec) => refspec.split(':').map((side) => ({ value: toBranchName(side),
kind: 'branch' as const })), ); }

type Rewriter = (text: string) => string;

const PRIVATE_KEY = /-----BEGIN [A-Z ]_PRIVATE KEY-----[\s\S]_?-----END [A-Z ]*PRIVATE KEY-----/g;

const KNOWN_TOKEN =
/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_\w{20,}|sk-[\w-]{20,}|xox[abposr]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|glpat-[\w-]{20,}|npm_[A-Za-z0-9]{36}|eyJ[\w-]+\.[\w-]+\.[\w-]+)/g;

const LONG_RUN = /(?<![\w+=-])[\w+=-]{32,}(?![\w+=-])/g;

const SECRET_ASSIGNMENT =
/\b(?<name>[A-Za-z_][\w-]_(?:key|token|secret|password|passwd|pwd|credential|auth)[\w-]_)(?<separator>\s*[=:]\s*["']?)(?<value>[^\s"'&;|]{6,})/gi;

const AUTH_SCHEME = /\b(?<scheme>Bearer|Basic)\s+(?<value>[\w.~+/=-]{8,})/g;

function makeStringRewriter( identifiers: Readonly<Record<string, IdentifierClass>>, salt: string,
): Rewriter { const toPlaceholder = (kind: string, value: string): string => derivePlaceholder(kind,
value, salt);

OpenAI Codex v0.160.1
--------

workdir: /root/.local/share/atc/workspaces/auto-mode-main/.worktrees/geo-771 model: gpt-6.1-sol
provider: openai approval: never sandbox: read-only reasoning effort: none reasoning summaries: none
session id: 01a13c03-a1f2-79f1-8d3f-bff5ea71daf2
--------

user changes against 'main' warning: Codex could not find bubblewrap on PATH. Install bubblewrap
with your OS package manager. See the sandbox prerequisites:
https://developers.openai.com/codex/concepts/sandboxing#prerequisites. Codex will use the bundled
bubblewrap in the meantime. 2026-10-14T20:03:54.133046Z ERROR
codex_api::endpoint::responses_websocket: failed to connect to websocket: HTTP error: 426 Upgrade
Required, url: wss://chatgpt.com/backend-api/codex/responses exec /bin/bash -lc 'git diff
5c2f2baedc05e303482f845246870cc0d800fb11 --stat; find .. -name AGENTS.md -o -name
AGENTS.override.md; ls .claude/skills' in
/root/.local/share/atc/workspaces/auto-mode-main/.worktrees/geo-771 succeeded in 354ms:
evals/lib/build-anonymised-corpus.test.ts | 4 ++++ evals/lib/build-anonymised-corpus.ts | 8 ++++++--
2 files changed, 10 insertions(+), 2 deletions(-) ../geo-771/AGENTS.md code-style docs-writing
project-testing testing

exec /bin/bash -lc 'cat AGENTS.md .claude/skills/{code-style,testing,project-testing}/SKILL.md; git
diff 5c2f2baedc05e303482f845246870cc0d800fb11; cat evals/lib/build-anonymised-corpus.ts; cat
evals/lib/build-anonymised-corpus.test.ts' in
/root/.local/share/atc/workspaces/auto-mode-main/.worktrees/geo-771 succeeded in 119ms:

# Agent Guidelines

auto-mode is a permission classifier: a core library and a Claude Code mod. When Claude Code is
about to prompt for a tool call, the mod runs the CLI, hands it the pending call on stdin, and reads
allow, deny, or nothing on stdout. Its target is a model that is not Claude driving Claude Code.

`docs/architecture/overview.md` is the authoritative account of how the pieces fit: the path of a
prompted call, the topology, the state auto-mode keeps, and the rules that hold across every stage.
It links one doc per stage and per kind of evidence. Read the overview and the docs for the parts
you touch in full before changing the request path, the policy, or the mod — grep locates code, it
does not teach the invariants. `docs/design/decision-model/` holds the approved parts of the
decision model that the code does not implement.

## Required reading

exec /bin/bash -lc "grep -n 'toBranchName\\|isIdentifier' evals/lib/build-anonymised-corpus.ts; cat
src/shell/split-command-words.ts; cat src/shell/split-shell-command.ts" in
/root/.local/share/atc/workspaces/auto-mode-main/.worktrees/geo-771 succeeded in 0ms: 332: value:
toBranchName(groups['branch'] ?? ''), 378:function toBranchName(ref: string): string { 736:
refspec.split(':').map((side) => ({ value: toBranchName(side), kind: 'branch' as const })), import {
splitShellTokens } from './split-shell-tokens.ts';

// Splits one shell segment into words with their quotes removed, then drops // leading environment
assignments and wrappers (env, sudo, timeout) and every // redirection, so the first word is the
program and the rest its arguments. export function splitCommandWords(text: string): readonly
string[] { const words = splitShellTokens(text).tokens.flatMap((token) => token.kind === 'word' ?
[token.value] : [], );

let index = 0;

while (index < words.length) { const word = words[index] ?? '';

    if (/^\w+=/u.test(word) || word === 'sudo' || word === 'command') {
      index += 1;
    } else if (word === 'env') {
      index += 1;

      while (words[index] === '-u' || /^\w+=/u.test(words[index] ?? '')) {
        index += words[index] === '-u' ? 2 : 1;
      }
    } else if (word === 'timeout') {
      index += 2;
    } else {
      break;
    }

}

return words.slice(index); } import { splitShellTokens } from './split-shell-tokens.ts';

export interface ShellSegment { readonly text: string; }

export function splitShellCommand(command: string): { readonly segments: readonly ShellSegment[];
readonly hasUnparsedConstruct: boolean; } { const scanned = splitShellTokens(command); const
segments: ShellSegment[] = []; let start: number | null = null; let end = 0;

for (const token of [...scanned.tokens, null]) { if (token === null || token.kind === 'separator') {
if (start !== null) { segments.push({ text: command.slice(start, end) }); }

      start = null;
    } else {
      start ??= token.start;
      end = token.end;
    }

}

// Substitution, process substitution, and output redirection can each hide // an effect the segment
text does not show. const hasUnparsedConstruct = scanned.hasSubstitution || scanned.isUnterminated
|| scanned.tokens.some((token) => token.kind === 'redirect' && token.operator.includes('>'));

return { segments, hasUnparsedConstruct }; }

exec /bin/bash -lc "bun --conditions=auto-mode-eval -e 'import {buildAnonymisedCorpus} from
\"./evals/lib/build-anonymised-corpus.ts\";
console.log(JSON.stringify(buildAnonymisedCorpus([{cwd:\"/tmp\",request:{command:\"echo ok;\\\\\\n#
note; git push origin sensitive-name\", task:\"Keep sensitive-name
unchanged\"},verdict:{},decidingStage:\"model\"}],\"salt\")))'; sed -n '270,305p'
evals/lib/build-anonymised-corpus.ts; grep -n \"comment\\|#\" src/shell/split-shell-tokens.ts |
head" in /root/.local/share/atc/workspaces/auto-mode-main/.worktrees/geo-771 succeeded in 18ms:
{"schemaVersion":1,"cases":[{"id":"recorded-0001","source":"recorded","request":{"command":"echo
ok;\\\n# note; git push origin branch-5fd25438","task":"Keep branch-5fd25438
unchanged"},"recordedVerdict":{},"decidingStage":"model"}]} ...(isHome ? [] : [{ value:
basename(root), kind: 'repo' as const }]), ...collectStrings(action.request).flatMap((text) =>
collectTextIdentifiers(text)), ...collectStrings(action.verdict).flatMap((text) =>
collectTextIdentifiers(text)), ...collectCommands(action.request, null).flatMap((command) =>
collectCommandBranches(command)), ]; }

function collectStrings(value: unknown): string[] { if (typeof value === 'string') { return [value];
}

if (Array.isArray(value)) { return value.flatMap((item: unknown) => collectStrings(item)); }

if (typeof value === 'object' && value !== null) { return Object.values(value).flatMap((item:
unknown) => collectStrings(item)); }

return []; }

function collectTextIdentifiers(text: string): Identifier[] { return [ ...collectGroups(text,
HOME_PATH).map((groups) => ({ value: groups['user'] ?? '', kind: 'user' as const, })),
...[FORGE_PATH, REPO_FLAG].flatMap((pattern) => collectGroups(text, pattern).flatMap((groups) => [ {
value: groups['owner'] ?? '', kind: 'owner' as const }, { value: groups['repo'] ?? '', kind: 'repo'
as const }, ]), ), ...collectGroups(text, WINDOWS_HOME).map((groups) => ({

codex The continuation handling introduces a reproducible regression in comment recognition after
shell separators, causing unrelated request text to be anonymised incorrectly.

Review comment:

- [P2] Remove continuation markers after shell separators —
  /root/.local/share/atc/workspaces/auto-mode-main/.worktrees/geo-771/evals/lib/build-anonymised-corpus.ts:422-423
  When a continuation follows a shell separator rather than whitespace, the NUL remains and prevents
  the shell parser from recognizing the following comment. For example,
  `echo ok;\<newline># note; git push origin sensitive-name` now collects `sensitive-name` as a
  pushed branch and replaces it throughout the request, although the push is commented out.
  Previously, the inserted space preserved comment recognition. Remove the marker at all shell
  word-start positions, not just after whitespace, so comment text cannot change unrelated task
  evidence. The continuation handling introduces a reproducible regression in comment recognition
  after shell separators, causing unrelated request text to be anonymised incorrectly.

Review comment:

- [P2] Remove continuation markers after shell separators —
  /root/.local/share/atc/workspaces/auto-mode-main/.worktrees/geo-771/evals/lib/build-anonymised-corpus.ts:422-423
  When a continuation follows a shell separator rather than whitespace, the NUL remains and prevents
  the shell parser from recognizing the following comment. For example,
  `echo ok;\<newline># note; git push origin sensitive-name` now collects `sensitive-name` as a
  pushed branch and replaces it throughout the request, although the push is commented out.
  Previously, the inserted space preserved comment recognition. Remove the marker at all shell
  word-start positions, not just after whitespace, so comment text cannot change unrelated task
  evidence.
