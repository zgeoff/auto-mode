# Action diagnostics

Read `$XDG_STATE_HOME/auto-mode/actions.jsonl`, or `~/.local/state/auto-mode/actions.jsonl` when the
variable is absent. Each recognized action has a `started` record and a final record with the same
`invocationID`. New files use mode `0600`. Set `AUTO_MODE_DIAGNOSTICS_PATH` to another file, or to
an empty string to disable the file. A failed diagnostic write does not change the verdict.

The records exclude commands, paths, prompts, configuration contents, credentials, provider
responses, and exception text. Configured and replacement rules use question identifiers; only
shipped rules retain their public names. Session and action identifiers use the first 16 hexadecimal
characters of SHA-256. Hash a recorded tool-call identifier to find its `actionHash`.

For Jev, `diagnostics.status` distinguishes `ask`, `failure`, `timeout`, and `cancelled`. `stage`
identifies credential resolution, evidence preparation, the request, or a validated response.
`keySource` and `keyResolved` show whether the environment or helper supplied a key. A request-stage
failure does not prove that an HTTP request reached the provider. `contributors` records every
answer that caused an ask, or the rule that caused a denial, with its choice, confidence, and
selected probability. `minConfidence` records the unchanged threshold. The final `verdict`
distinguishes a failure that defers from one that fails closed.

An ask on `PermissionRequest` writes no verdict to stdout. A completed record with status `ask`
therefore proves a classifier ask even when the mod retains manual approval. A start without a final
record proves only that the CLI started; a killed process may leave that pair incomplete.

The Claude mod also writes bounded debug messages for invocation and fallback: insufficient budget,
nonzero exit, truncated output, no usable verdict, subprocess failure, or subprocess timeout. It
never copies child output or exception text into those messages. Match the session, timestamp, and
supported tool-call identifier with the action records. The absence of a record does not prove an
allow or an ask.
