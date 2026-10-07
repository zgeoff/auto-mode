# auto-mode

auto-mode is a permission classifier: a core library that other software can call, plus a Claude
Code mod. Claude Code calls it before a tool runs and reads allow, deny, or nothing. Its target is a
model that is not Claude driving Claude Code.

`docs/architecture/overview.md` is the authoritative account of how the pieces fit: the two tiers,
the verdict contract, permission evidence, and the failure modes.
`docs/architecture/decision-model.md` is the approved design for what each stage decides. Read both
in full before changing the hook path, the policy, or the Claude Code integration — grep locates
code, it does not teach the invariants.

## Layout

Single package, no workspaces. `src/` groups modules by concern, one primary export per file:
`harness/` normalises a payload and renders a verdict; `rules/` is the deterministic first tier;
`model/` is the second tier and its decision and Messages API clients; `policy/` assembles the
prompt; `transcript/` reads the last direct user message for Jev and conversation history for
generative providers; `config/` holds configuration and presets; `install/` prints the hook entry a
harness needs. `cli.ts` is the entrypoint. `policy/` at the repo root holds the prompt itself.
`fixtures/` holds one recorded payload per harness.

## Runtime rules

- Bun for development, node for the artifact. `bun test`, never vitest. The published `dist/` runs
  under node 24 in a harness that has no bun, so a CI step runs the built CLI under real node
  against each fixture.
- The hook always exits 0. A non-zero exit reads as a broken hook, and the JSON on stdout is what
  decides the outcome.
- Writing nothing is a verdict, not a failure: it means auto-mode has no opinion and the harness
  does what it would have done alone. An unknown harness, a non-tool-gate event, a body that is not
  JSON, and a failed model call under `onFailure: "defer"` all write nothing.
- Runtime dependencies are bundled, not external. The hook starts once per tool call, so resolving a
  package from `node_modules` is paid on every call.
- Everything CI and the hooks run is a root `package.json` script; invoke a gate by script name,
  never by re-spelling the command.

## The policy

Everything under `policy/` is verbatim model input. It is not prose for a reader, and the formatter
is configured to leave it alone: its bytes are the prompt and the cache prefix, so a reflow is a
prompt change and belongs in a commit that reviews it as one.

- `decision.md` is the Jev framework, `classifier.md` is the generative framework, and `rules.md` is
  the rule list. `loadPolicy` splices the rules at the `<rules>` marker. `auto-mode print-prompt`
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

## Claude Code integration contract

- Claude Code is the only harness auto-mode targets. Codex and Muse ship their own auto mode, so a
  feature may depend on what only Claude Code offers.
- auto-mode never writes a Claude Code settings file. It prints the entry for the user to paste.
- A change to the Claude Code contract is verified against Claude Code by hand before it merges. The
  fixtures are recordings, not a substitute for running it.

## Function naming — project verbs

Project additions to the shared taxonomy, declared in `.oxlintrc.json`:

- `classify` — decide which category a value falls into, from a closed set the caller knows
  (`classifyLocally`, `classifySegment`). Distinct from `check`, which reports findings rather than
  returning a category.
- `detect` — identify which of a closed set of known variants a value is, or null when none matches
  (`detectHarness`). Distinct from `find`, which searches a collection.

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
