<div align="center">
  <h1>auto-mode</h1>
  <p>
    <a href="https://www.npmjs.com/package/auto-mode"><img src="https://img.shields.io/npm/v/auto-mode" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>
</div>

**auto-mode** answers the permission prompts Claude Code would show, so an agent can work unattended
and stop only at what matters. It is built for a model other than Claude driving Claude Code, which
gets no judging of its own. A Claude Code mod hands each prompted call to auto-mode before the
dialog appears: local rules settle reads and build cleanup, a containment check keeps writes inside
the task's own worktrees and branches, and Jev judges the rest against a written policy. A denied
agent gets a reason and carries on another way, and the user sees a prompt when the agent runs out
of denials or when auto-mode cannot judge the call.

To get a first session working, install the package, give auto-mode your TypeSafe API key, and start
Claude Code with the mod.

## Install

auto-mode needs node 24 or later, Claude Code, and a TypeSafe API key for Jev.

```sh
npm i -g auto-mode
claude --plugin-dir "$(npm root -g)/auto-mode/mods/auto-mode"
```

Export your key as `TYPESAFE_API_KEY`, or point the configuration at a command that prints it.
[Claude permission mod](./docs/guides/claude-mod.md) covers the mod and a trial session you can
undo.

## Supported harnesses

- **Claude Code**, through the bundled mod. Codex and Muse Code ship their own auto mode, and a Muse
  model reaches auto-mode through the mod inside Claude Code.

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

Other software calls the classifier directly:

```ts
import { classifyAction, loadConfig, parseActionRequest } from 'auto-mode';

const request = parseActionRequest(body);

if (request !== null) {
  const outcome = await classifyAction(request, await loadConfig());
}
```

Build every request with `parseActionRequest`, because the classifiers trust the request they
receive and the parser enforces the rules the mod's requests follow.

## Configuration

auto-mode reads one JSON file in your XDG config directory, and runs on its shipped defaults when
the file is missing. The file chooses the classifier and the judge, the scope sources, the denial
budget and the failure response, and turns on the opt-in request capture.
[Configuration](./docs/guides/configuration.md) covers every field and the credentials.

## Documentation

[docs/](./docs/README.md) holds the architecture, the guides and the runbooks.

## Licence

MIT.
