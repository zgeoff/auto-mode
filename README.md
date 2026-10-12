<div align="center">
  <h1>auto-mode</h1>
  <p>
    <a href="https://www.npmjs.com/package/auto-mode"><img src="https://img.shields.io/npm/v/auto-mode" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>
</div>

**auto-mode** tries to mitigate the risk of unattended non-Claude agents inside Claude Code.

auto-mode runs as a Claude Code mod, and its operating model is loosely modelled on Anthropic's
native auto mode. Instead of one model, it pairs a fast decision model (such as Jev) with a
traditional classifier-judge model (such as Haiku) to cover the first one's shortcomings.

## Install

auto-mode needs node 24 or later, Claude Code, and a TypeSafe API key for Jev.

```sh
npm i -g auto-mode
claude --plugin-dir "$(npm root -g)/auto-mode/mods/auto-mode"
```

Export your key as `TYPESAFE_API_KEY`, or point the configuration at a command that prints it.
[Claude permission mod](./docs/guides/claude-mod.md) covers the mod and a trial session you can
undo.

## Features

- **Local rules** allow read-only calls and build-output cleanup without a model call
  ([local rules](./docs/architecture/stages/local-rules.md)).
- **Containment** denies a write outside the task's own worktrees, branches and pull requests
  ([containment](./docs/architecture/stages/containment.md)).
- **The edit bypass** allows an in-scope file edit once a secret scan finds nothing
  ([the edit bypass](./docs/architecture/stages/edit-bypass.md)).
- **Jev** judges the remaining calls against the shipped rules and your own
  ([Jev](./docs/architecture/stages/jev.md)).
- **The judge**, on by default, reviews every Jev deny, and overturns it when your last message
  asked the main agent for exactly this action, or when no rule covers the action
  ([the judge](./docs/architecture/stages/judge.md)).
- **The denial budget** hands a call back to you when an agent keeps getting denied
  ([the denial budget](./docs/architecture/stages/denial-budget.md)).
- **Your own rules** from your Claude settings join the policy as block rules
  ([settings and repository facts](./docs/architecture/evidence/settings-and-repository.md)).
- **Action diagnostics** record how each call was decided, without the command or the prompt
  ([action diagnostics](./docs/guides/diagnostics.md)).

Read [the rules](./policy/rules.md) before you enable the mod.
[Writing a policy](./docs/guides/policy.md) covers how the rules clear and how to change them.

## Library

You can call auto-mode's core APIs from your own code. `parseActionRequest` reads the request the
mod sends the CLI ([the contract](./docs/architecture/mod.md#the-contract)), and `classifyAction`
runs it through [the stages](./docs/architecture/overview.md#the-path-of-a-prompted-call) from the
local rules to the judge. The two options in the example apply the denial budget and write the
action log, as the CLI does, and `recordScope` adds what a finished Bash call created to the
session's scope.

```ts
import { classifyAction, loadConfig, parseActionRequest } from 'auto-mode';

const request = parseActionRequest(body);

if (request !== null) {
  const outcome = await classifyAction(request, await loadConfig(), {
    budget: true,
    actionLog: true,
  });
}
```

## Configuration

Read the [configuration](./docs/guides/configuration.md) guide, which covers every field and the
credentials.

## Documentation

[docs/](./docs/README.md) covers the architecture and the user guides.

## Licence

MIT.
