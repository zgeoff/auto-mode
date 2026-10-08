<div align="center">
  <h1>auto-mode</h1>
  <p>
    <a href="https://www.npmjs.com/package/auto-mode"><img src="https://img.shields.io/npm/v/auto-mode" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>
</div>

**auto-mode** judges the tool calls that Claude Code would prompt for. It is a core library and a
Claude Code mod. The mod returns allow, deny, or no verdict before the permission dialog appears.
Local rules settle read-only actions and build cleanup; Jev evaluates the remaining actions against
a written policy.

The Jev request includes the policy, your configured environment and permissions, the complete
proposed action, and the last direct user message. It excludes the rest of the session. Configure
standing permissions upfront; earlier conversational grants and restrictions are unavailable to the
classifier.

## Install

```sh
npm i -g auto-mode
claude --plugin-dir "$(npm root -g)/auto-mode/mods/auto-mode"
```

The package ships the mod in `mods/auto-mode`. The mod runs the `auto-mode` executable on `PATH`;
its `command` option takes another executable. [Claude permission mod](./docs/guides/claude-mod.md)
covers the mod, its time limits, and a trial session.

Create the classifier configuration:

```json
{
  "classifiers": { "jev": { "apiKeyEnv": "TYPESAFE_API_KEY" } },
  "decision": { "classifier": "jev" }
}
```

Save it as `~/.config/auto-mode/config.json` and export your TypeSafe API key, or set the entry's
`apiKeyCommand` to a command that prints it. [Configuration](./docs/guides/configuration.md) covers
the registries, credentials, and migrating an older file.

## Standing permissions

Jev imports explicit entries from `autoMode.environment`, `autoMode.allow`, `autoMode.soft_deny`,
and `autoMode.hard_deny` in your user Claude settings. It imports no credential values or shell
permission patterns. `$defaults` refers to auto-mode's shipped policy; it does not expand Claude's
built-in classifier rules.

Configured allows clear soft blocks. Hard blocks take priority over all allows and conversational
consent. [False-positive clarification](./docs/guides/policy.md#false-positive-clarification) can
clear Policy Tampering and Audit Tampering. The last direct user message can supply the exact action
and target that a soft block needs; replies such as “go ahead” cannot supply an unseen proposal.

Read [the policy](./policy/rules.md) before you enable the mod.
[Writing a policy](./docs/guides/policy.md) covers the precedence and the limits of an action-only
assessment.

## Decisions and failures

Jev evaluates each named rule with a typed choice. auto-mode returns a denial for a confident block,
approval when every rule confidently allows the action, and a denial for uncertain decisions. Every
denial names its rule, the harm, and what clears it, and the agent continues on another path. The
confidence threshold is configurable and needs evaluation against your actions.

A missing key, failed API call, malformed response, or oversized request follows
`decision.onFailure`. The default `defer` writes no verdict and keeps the prompt; `deny` fails
closed. Failures write a diagnostic to stderr. auto-mode never truncates a Jev action to make it
fit.

## Commands

| Command                      | Effect                                    |
| ---------------------------- | ----------------------------------------- |
| `auto-mode run`              | Read a mod request and write a verdict    |
| `auto-mode run --explain`    | Write decision details to stderr          |
| `auto-mode run --local-only` | Skip the model tier                       |
| `auto-mode run --jev-only`   | Require Jev with a 5-second API timeout   |
| `auto-mode print-prompt`     | Print the selected provider's base policy |
| `auto-mode config migrate`   | Rewrite an older config file in place     |

The mod evaluates only ask decisions and preserves existing allow and deny decisions. It runs the
CLI as a bounded child process with `--jev-only`. The `spark`, `claude`, `glm`, and `messages`
classifier kinds use the Messages API and serve library callers.

## Library

```ts
import { classifyAction, loadConfig, parseActionRequest } from 'auto-mode';

const request = parseActionRequest(body);

if (request !== null) {
  const outcome = await classifyAction(request, await loadConfig());
}
```

`classifyAction` runs both tiers and returns the verdict, a note, and diagnostics. A request carries
the session identity, the action, and the task context; `parseActionRequest` builds one from the
mod's JSON.

## Documentation

- [Architecture](./docs/architecture/overview.md) covers the request, decision combination, and the
  mod contract.
- [Configuration](./docs/guides/configuration.md) covers every setting and the imported Claude
  rules.
- [Claude permission mod](./docs/guides/claude-mod.md) covers the request, the verdict, and the time
  limits.
- [Writing a policy](./docs/guides/policy.md) covers rule edits and evaluation.

## Licence

MIT.
