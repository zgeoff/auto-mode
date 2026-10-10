<!-- Generated file — do not edit. Edit agents/project.md here, or agents/shared.md in zgeoff/tools. -->

# Agent Guidelines

## Operations

- AGENTS.md is generated from `agents/shared.md` and `agents/project.md` — edit the partials, never
  AGENTS.md itself. The shared partial is synced from
  [zgeoff/tools](https://github.com/zgeoff/tools); cross-project rule changes belong there.
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

## Code style

Mechanically enforced rules (oxfmt, oxlint, format-codemod) aren't repeated here — this file covers
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

### Function naming

Every function name starts with a prefix from the closed list below: pick from it, or extend this
file in the same PR that introduces the new verb. The prefix is a contract — a reader should know
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

**Framework conventions** — where the ecosystem's prefix is load-bearing, it wins:

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

## Dependencies

- Pin exact versions — no `^`/`~` ranges. (`bun add` saves exact automatically via `exact = true` in
  bunfig.toml — the rule applies to hand-written edits.)

## Review bots

CodeRabbit reviews every PR. Its shared config lives in the zgeoff/coderabbit repo, and a repo-root
`.coderabbit.yaml` with `inheritance: true` layers repo-specific settings on top. CodeRabbit reads
this file as its guidelines. A repo that runs another review bot names it and its config in
`agents/project.md`, and these rules cover that bot too.

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

# auto-mode

auto-mode is a permission classifier: a core library and a Claude Code mod. When Claude Code is
about to prompt for a tool call, the mod runs the CLI, hands it the pending call on stdin, and reads
allow, deny, or nothing on stdout. Its target is a model that is not Claude driving Claude Code.

`docs/architecture/overview.md` is the authoritative account of how the pieces fit: the two tiers,
the mod contract, permission evidence, and the failure modes. `docs/architecture/decision-model.md`
is the approved design for what each stage decides. Read both in full before changing the request
path, the policy, or the mod — grep locates code, it does not teach the invariants.

## Layout

The root package is the published `auto-mode`; `evals/` is a private Bun workspace package beside
it. `src/` groups modules by concern, one primary export per file: `request/` parses a mod request
and renders a verdict; `rules/` is the deterministic first tier; `model/` is the second tier and its
decision and Messages API clients; `policy/` assembles the prompt; `config/` holds configuration and
presets; `budget/` counts denials per session; `containment/` denies a write outside the task scope;
`scope/` builds that scope from the configured scope sources and keeps what each session created;
`bypass/` lets an in-scope file edit skip Jev; `secrets/` scans edit content with the bundled
Betterleaks rule set, which `scripts/build-secret-rules.ts` generates. `classify-action.ts` runs
both tiers with the containment check and the edit bypass between them, and is the library entry
point; `index.ts` is the public API; `eval/index.ts` is the unpublished `auto-mode/eval` subpath;
`cli.ts` is the entrypoint the mod runs. `mods/auto-mode/` is the Claude Code mod. `policy/` at the
repo root holds the prompt itself. `fixtures/` holds mod requests recorded in a live Claude Code
session.

`evals/` holds the evaluation tooling: `eval.ts` is the `bun run eval` command, which plans, runs,
resumes and compares one experiment; `experiments/` holds one `defineExperiment` file per experiment
(its corpus, its ordered stages, its measurements) and the registry that lists them; `runners/` are
the older `eval:*` scripts; `corpora/` the committed corpora, with the recorded model answers the
replays read under `corpora/recorded/`; `lib/` the helpers they and the suites share, including the
run, plan, result schemas and interval statistics; and `replay/` the suites that replay the corpora
offline. Evaluation reports live in the private zgeoff/auto-mode-evals repository, not here. Evals
import auto-mode code by package name: `auto-mode` for the public API and `auto-mode/eval` for
internals. Both resolve to `src/` under the `auto-mode-eval` export condition, which `bun run test`,
the `eval:*` scripts and `evals/tsconfig.json` set; without it the subpath does not resolve. Evals
also reuse the root `test-utils/` helpers by path, and those import `src/` directly. Bun cannot
install a workspace's dependency on the root package, so `prepare` links
`evals/node_modules/auto-mode` to the root instead.

## Runtime rules

- Bun for development, node for the artifact. `bun test`, never vitest. The published `dist/` runs
  under node 24 on a machine that may have no bun, so a CI step runs the built CLI under real node
  against each fixture.
- The CLI always exits 0. The mod reads a non-zero exit as a failure, and the JSON on stdout is what
  decides the outcome.
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

- `decision.md` is the Jev framework, `classifier.md` is the generative framework, and `rules.md` is
  the rule list. `denial.md` is the instruction every deny reason ends with; it reaches the agent,
  not a classifier. `loadPolicy` splices the rules at the `<rules>` marker. `auto-mode print-prompt`
  prints the selected base policy; configured rules and action evidence are separate request fields.
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
  does not know keeps the prompt.
- `mods/auto-mode/hooks/parse-decision.ts` alone maps the CLI's verdict to Claude Code's permission
  decision.
- auto-mode never writes Claude Code's settings files.
- A change to the mod contract is verified by hand in a live Claude Code session before it merges.
  The fixtures are recordings, not a substitute for running it.

## Function naming — project verbs

Project additions to the shared taxonomy, declared in `.oxlintrc.json`:

- `classify` — decide which category a value falls into, from a closed set the caller knows
  (`classifyLocally`, `classifySegment`). Distinct from `check`, which reports findings rather than
  returning a category.

`main` is exempt.

## Comments

- No JSDoc; `zgeoff/no-jsdoc` enforces it. A fact a reader needs belongs in the code, a named
  constant, a test whose name states it, the commit body, or `docs/`.
- A `//` comment holds one thing: the reason the obvious alternative is wrong, when the cause lives
  outside the file — a harness quirk, a library defect, a measured number. Three lines at most.
- Comments describe the code as it is: no history, no project state, and no naming of other
  declarations, which a rename strands.

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
