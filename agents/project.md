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
`bypass/` lets an in-scope file edit skip Jev; `judge/` reviews each Jev deny, confirming it with a
written reason or overturning it, through `claude -p` or the Messages API; `secrets/` scans edit
content with the bundled Betterleaks rule set, which `scripts/build-secret-rules.ts` generates;
`capture/` appends each judged request to the opt-in capture, never inside a git work tree.
`classify-action.ts` runs both tiers with the containment check and the edit bypass between them and
the judge after Jev, and is the library entry point; `index.ts` is the public API; `eval/index.ts`
is the unpublished `auto-mode/eval` subpath; `cli.ts` is the entrypoint the mod runs.
`mods/auto-mode/` is the Claude Code mod; its `contract/` holds the request and verdict shapes, the
message origins and the scope commands that the mod and the CLI share, with no dependencies, because
the mod ships as raw TypeScript. `policy/` at the repo root holds the prompt itself. `fixtures/`
holds mod requests recorded in a live Claude Code session.

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

`bun run check:imports` (`scripts/check-imports.ts`) enforces the module boundaries in CI and on
pre-push. Every file under `src/` belongs to a zone: an orchestrator file, `request/`, a support
module or a stage. A new `src/` folder joins a zone in that script, in the same PR that adds it.
`scripts/check-imports-known.json` lists each import that breaks a zone today, grouped by the ticket
that removes it. Any other forbidden import fails the check, and so does a listed import the code no
longer has, so the list only shrinks. Never add an entry to make a new import pass.

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

- `decision.md` is the Jev framework, `classifier.md` is the generative framework, `judge.md` is the
  judge's framework, and `rules.md` is the rule list. `denial.md` is the instruction every deny
  reason ends with; it reaches the agent, not a classifier. `loadPolicy` splices the rules at the
  `<rules>` marker. `auto-mode print-prompt` prints the selected base policy; configured rules and
  action evidence are separate request fields.
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
