<div align="center">
  <h1>auto-mode</h1>
  <p>
    <a href="https://www.npmjs.com/package/auto-mode"><img src="https://img.shields.io/npm/v/auto-mode" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>
</div>

**auto-mode** tries to mitigate the risk of unattended non-Claude agents inside Claude Code.

auto-mode runs as a Claude Code mod, and it's operational model is loosely modeled off Anthropic's
native auto mode, but instead uses a fast decision-type model (ex. Jev) in conjunction with a
traditional classifier-judge type model (ex. Haiku) to cover any shortcomings. 

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
  asked the main agent for exactly this action ([the judge](./docs/architecture/stages/judge.md)).
- **The denial budget** hands a call back to you when an agent keeps getting denied
  ([the denial budget](./docs/architecture/stages/denial-budget.md)).
- **Your own rules** from your Claude settings join the policy as block rules
  ([settings and repository facts](./docs/architecture/evidence/settings-and-repository.md)).
- **Action diagnostics** record how each call was decided, without the command or the prompt
  ([action diagnostics](./docs/guides/diagnostics.md)).

Read [the rules](./policy/rules.md) before you enable the mod.
[Writing a policy](./docs/guides/policy.md) covers how the rules clear and how to change them.

## Library

You can invoke auto-mode's core API's programatically:

```ts
import { classifyAction, loadConfig, parseActionRequest } from 'auto-mode';

const request = parseActionRequest(body);

if (request !== null) {
  const outcome = await classifyAction(request, await loadConfig());
}
```

## Configuration

Read the [Configuration](./docs/guides/configuration.md) docs which cover every field and the credentials.

## Documentation

[docs/](./docs/README.md) covers architecture & user guides.

## Licence

MIT.
