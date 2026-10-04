<div align="center">
  <h1>auto-mode</h1>
  <p>
    <a href="https://www.npmjs.com/package/auto-mode"><img src="https://img.shields.io/npm/v/auto-mode" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>
</div>

**auto-mode** judges coding-agent tool calls through a permission hook. It returns allow, deny, or
no verdict to Claude Code, Codex, and Muse Code. Local rules settle read-only actions and build
cleanup; Jev evaluates the remaining actions against a written policy.

The Jev request includes the policy, your configured environment and permissions, the complete
proposed action, and the last direct user message. It excludes the rest of the session. Configure
standing permissions upfront; earlier conversational grants and restrictions are unavailable to the
classifier.

## Install

```sh
npm i -g auto-mode
auto-mode init claude --event permission-request
```

Paste the printed hook entry into the file it identifies. `init` prints configuration and never
writes into a harness's settings. [Harnesses](./docs/guides/harnesses.md) covers registration for
each harness.

Create the classifier configuration:

```json
{
  "preset": "jev",
  "provider": { "apiKeyEnv": "TYPESAFE_API_KEY" }
}
```

Save it as `~/.config/auto-mode/config.json` and export your TypeSafe API key. Hooks that run with a
scrubbed environment need `provider.apiKeyCommand` instead.
[Configuration](./docs/guides/configuration.md) covers credentials and provider overrides.

## Standing permissions

Jev imports explicit entries from `autoMode.environment`, `autoMode.allow`, `autoMode.soft_deny`,
and `autoMode.hard_deny` in your user Claude settings. It imports no credential values or shell
permission patterns. `$defaults` refers to auto-mode's shipped policy; it does not expand Claude's
built-in classifier rules.

Configured allows clear soft blocks. Hard blocks take priority over all allows and conversational
consent. [False-positive clarification](./docs/guides/policy.md#false-positive-clarification) can
clear Policy Tampering and Audit Tampering. The last direct user message can supply the exact action
and target that a soft block needs; replies such as “go ahead” cannot supply an unseen proposal.

Read [the policy](./policy/rules.md) before you enable the hook.
[Writing a policy](./docs/guides/policy.md) covers the precedence and the limits of an action-only
assessment.

## Decisions and failures

Jev evaluates each named rule with a typed choice. auto-mode returns a denial for a confident block,
approval when every rule confidently allows the action, and manual approval for uncertain decisions.
The confidence threshold is configurable and needs evaluation against your actions.

A missing key, failed API call, malformed response, or oversized request follows `onFailure`. The
default `defer` writes no verdict and leaves the harness to decide; `deny` fails closed. Failures
write a diagnostic to stderr. auto-mode never truncates a Jev action to make it fit.

## Commands

| Command                      | Effect                                    |
| ---------------------------- | ----------------------------------------- |
| `auto-mode run`              | Read a hook payload and write a verdict   |
| `auto-mode run --explain`    | Write decision details to stderr          |
| `auto-mode run --local-only` | Skip the model tier                       |
| `auto-mode print-prompt`     | Print the selected provider's base policy |
| `auto-mode init <harness>`   | Print a hook entry                        |

Existing `spark`, `claude`, and `glm` presets use the Messages API and conversation history. Select
`jev` explicitly to change an existing provider configuration.

## Documentation

- [Architecture](./docs/architecture/overview.md) covers the request, decision combination, and wire
  contract.
- [Configuration](./docs/guides/configuration.md) covers every setting and the imported Claude
  rules.
- [Harnesses](./docs/guides/harnesses.md) covers registration and hook trust.
- [Writing a policy](./docs/guides/policy.md) covers rule edits and evaluation.

## Licence

MIT.
