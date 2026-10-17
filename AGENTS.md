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

| Skill                | Load before                                                                        |
| -------------------- | ---------------------------------------------------------------------------------- |
| `code-style`         | writing, reviewing, or renaming any TypeScript — the shared function-verb taxonomy |
| `project-code-style` | the same, beside `code-style` — auto-mode's own verbs and the comment rules        |
| `testing`            | designing, writing, or reviewing tests                                             |
| `project-testing`    | the same, beside `testing` — the preload, host environment, and mod checks         |
| `docs-writing`       | writing or editing any committed prose: `docs/`, READMEs, this file, skills        |

## Layout

- `policy/` at the repo root holds the prompt itself, such as `judge.md` for the judge;
  `src/policy/` only assembles it. [The policy](#the-policy) gives its rules.
- `evals/` is a private workspace package. It imports auto-mode by package name, with
  `auto-mode/eval` for internals. `evals/corpora/` holds the corpora and, under `recorded/`, the
  recorded model answers the replays read. `fixtures/` holds mod requests recorded in a live Claude
  Code session. Evaluation reports live in the private zgeoff/auto-mode-evals repository.
- `bun run build` generates `dist/`, the published artifact. `scripts/build-secret-rules.ts`
  generates `src/secrets/betterleaks-rules.json`, and release-please writes `CHANGELOG.md`; never
  edit either by hand.

## Boundaries

- The `zgeoff/import-zones` lint rule enforces the module boundaries, and `.oxlintrc.json` holds its
  zones. Every file under `src/` belongs to a zone, so a new `src/` folder joins one in the same PR
  that adds it.
- Never add an `oxlint-disable-next-line zgeoff/import-zones` comment to make an import pass. Change
  the import, or change the zones in a PR that reviews the boundary.
- `e2e/import-zones.test.ts` checks that each boundary still fails a forbidden import.

## Commands

- `bun run lint` is plain oxlint. `bun run lint:full` adds the type-aware pass and the type check,
  and is CI-only: never run it locally. `bun run check` includes it, so leave that to CI too.
- lefthook runs the light checks before a commit and a push. Leave the heavier checks to CI, because
  the host may have little memory.
- Pin exact versions, with no `^` or `~` ranges. `bun add` saves exact versions, so the rule covers
  hand-written edits.

## Runtime rules

- Bun for development, node for the artifact. `bun test`, never vitest. The published `dist/` runs
  under node 24 on a machine that may have no bun, so the e2e suite runs the built CLI under node
  against the recorded mod requests.
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
- Invoke a gate by its root `package.json` script name, never by re-spelling the command.

## The policy

Everything under `policy/` is verbatim model input. It is not prose for a reader, and the formatter
is configured to leave it alone: its bytes are the prompt and the cache prefix, so a reflow is a
prompt change and belongs in a commit that reviews it as one.

- `decision.md` is the Jev framework, `judge.md` is the judge's framework, and `rules.md` is the
  rule list. `containment.md` is the Outside Task Scope rule the judge reads when it reviews a
  containment deny the user named. `denial.md` is the instruction every deny reason ends with; it
  reaches the agent, not a classifier. `loadPolicy` splices the rules at the `<rules>` marker.
  `auto-mode print-prompt` prints the selected base policy; configured rules and action evidence are
  separate request fields.
- Every instruction to block must terminate at a rule name that exists in `rules.md` or an explicit
  configured deny entry. An evaluation rule in a framework may never order a block on its own — a
  block the model cannot name is one the user cannot read or appeal. A block that cannot be named is
  an allow.
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
- `mods/auto-mode/contract/` holds what the mod and the CLI share and has no dependencies, because
  the mod ships as raw TypeScript.
- A hooks module imports only its own plugin's files, by relative path, and `claude-code`; Claude
  Code refuses a package import, its own package included.
- `mods/auto-mode/hooks/parse-decision.ts` alone maps the CLI's verdict to Claude Code's permission
  decision.
- auto-mode never writes Claude Code's settings files.
- A change to the mod contract is verified by hand in a live Claude Code session before it merges.
  The fixtures are recordings, not a substitute for running it.

## Banned words

Fix these on sight in all prose: `bites`, `CAS`, `ceiling`, `fence`/`fencing`, `floor`,
`load-bearing`, `seam`, `surface`.
