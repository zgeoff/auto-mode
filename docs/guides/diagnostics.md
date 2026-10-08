# Action diagnostics

Read `$XDG_STATE_HOME/auto-mode/actions.jsonl`, or `~/.local/state/auto-mode/actions.jsonl` when the
variable is absent. Each recognized action has a `started` record and a final record with the same
`invocationID`. New files use mode `0600`. Set `AUTO_MODE_DIAGNOSTICS_PATH` to another file, or to
an empty string to disable the file. A failed diagnostic write does not change the verdict. Records
carry `schemaVersion` 3. A version 2 record lacks the three budget fields below, and a version 1
record in an older file also carries `harness` and `event`.

The records exclude commands, paths, prompts, configuration contents, credentials, provider
responses, and exception text. Configured and replacement rules use question identifiers; only
shipped rules retain their public names. Session and action identifiers use the first 16 hexadecimal
characters of SHA-256. Hash a recorded tool-call identifier to find its `actionHash`.

For Jev, `diagnostics.status` distinguishes `allow`, `deny`, `failure`, `timeout`, and `cancelled`.
`stage` identifies credential resolution, evidence preparation, the request, or a validated
response. `keySource` and `keyResolved` show whether the environment or helper supplied a key. A
request-stage failure does not prove that an HTTP request reached the provider. `failureReason`
holds `request-too-large` when the serialized request exceeds 100,000 bytes and no call was made,
`aborted` when the call or the response read was aborted, with `status` showing whether by the
provider timeout, the evaluation deadline, or a cancellation, `network` when the call did not
complete, `http-status` for a non-success response, and `invalid-response` for a body that fails
validation. It is `null` for other failures and for a completed decision. `requestBytes` holds the
UTF-8 size of the serialized request body whenever the body was built, including for the failures
above; it is `null` when a failure came before the body. It records a size only, never content.
`contributors` records the rule that caused a confident denial, or every answer that left the
decision uncertain, with its choice, confidence, and selected probability. A denial whose
contributors hold no confident block is an uncertain one. `minConfidence` records the unchanged
threshold. The final `verdict` distinguishes a failure that defers from one that fails closed.

Each final record also measures the task, so escalations can be counted per session:

| Field           | Values                                                                |
| --------------- | --------------------------------------------------------------------- |
| `decidingStage` | `local`, `jev`, `messages`, `retry`, or `budget`; `null` on `started` |
| `denials`       | `{ consecutive, session }` after this action; `null` on `started`     |
| `escalation`    | `true` when the denial budget left this action to the user            |

`local` is the deterministic tier and `jev` or `messages` the classifier. `retry` is a repeat of the
action just denied, denied again without a classifier call. `budget` marks the action that exceeded
the [denial budget](./configuration.md#denial-budget): auto-mode wrote no verdict, Claude Code
showed its prompt, and `denials` restarts at zero. Denial counts outside these records live in
`$XDG_STATE_HOME/auto-mode/denials/`, keyed by a hash of the session and subagent identifiers;
`AUTO_MODE_DIAGNOSTICS_PATH` does not move or disable them.

A completed decision always writes a verdict to stdout, except an escalation, which writes nothing.
A start without a final record proves only that the CLI started; a killed process may leave that
pair incomplete.

The Claude mod also writes bounded debug messages for invocation and fallback: insufficient budget,
nonzero exit, truncated output, no usable verdict, subprocess failure, or subprocess timeout. It
never copies child output or exception text into those messages. Match the session, timestamp, and
supported tool-call identifier with the action records. The absence of a record does not prove an
allow or a denial.
