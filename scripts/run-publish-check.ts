import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as z from 'zod';
import type { PublishAction } from './pick-publish-actions.ts';
import { pickPublishActions } from './pick-publish-actions.ts';
import type { RunProgram } from './run-program.ts';
import { runProgram } from './run-program.ts';

export interface PublishCheckOptions {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;

  // owner/name, as GITHUB_REPOSITORY holds it.
  readonly repository: string;

  readonly canPublishHere: boolean;
  readonly runProgram: RunProgram;
}

// The check reads every release tag, not the release this run tagged: a release whose publish run
// failed stays pending, so each later push dispatches it again.
export function runPublishCheck(options: Readonly<PublishCheckOptions>): PublishAction[] {
  const run = { cwd: options.cwd, env: options.env };
  const text = readFileSync(join(options.cwd, 'package.json'), 'utf8');
  const manifest = manifestSchema.parse(JSON.parse(text));
  const head = options.runProgram(['git', 'rev-parse', 'HEAD'], run);

  if (head.exitCode !== 0) {
    throw new Error(`git rev-parse HEAD failed: ${head.stderr.trim()}`);
  }

  const actions = pickPublishActions({
    name: manifest.name,
    head: head.stdout.trim(),
    canPublishHere: options.canPublishHere,
    registry: options.runProgram(
      ['npm', 'view', manifest.name, 'versions', 'dist-tags', '--json'],
      run,
    ),
    tagListing: options.runProgram(
      ['git', 'ls-remote', '--tags', 'origin', `refs/tags/${manifest.name}-v*`],
      run,
    ),
  });

  return actions.map((action) =>
    action.kind === 'dispatch' ? runPublishDispatch(options, action) : action,
  );
}

const manifestSchema = z.object({ name: z.string() });

function runPublishDispatch(
  options: Readonly<PublishCheckOptions>,
  action: Extract<PublishAction, { kind: 'dispatch' }>,
): PublishAction {
  const result = options.runProgram(
    [
      'gh',
      'workflow',
      'run',
      'main.yml',
      '--repo',
      options.repository,
      '--ref',
      action.tag,
      '-f',
      'republish=true',
    ],
    { cwd: options.cwd, env: options.env },
  );

  if (result.exitCode !== 0) {
    return {
      kind: 'fail',
      reason: `gh workflow run at ${action.tag} failed: ${result.stderr.trim()}`,
    };
  }

  return action;
}

function runCLI(): void {
  const output = process.env['GITHUB_OUTPUT'];
  const repository = process.env['GITHUB_REPOSITORY'];

  if (output === undefined || repository === undefined) {
    process.stderr.write('publish check: GITHUB_OUTPUT and GITHUB_REPOSITORY must be set\n');

    process.exitCode = 2;

    return;
  }

  const actions = runPublishCheck({
    cwd: process.cwd(),
    env: process.env,
    repository,
    canPublishHere: process.env['CAN_PUBLISH_HERE'] === 'true',
    runProgram,
  });

  for (const action of actions) {
    const stream = action.kind === 'fail' ? process.stderr : process.stdout;

    stream.write(`publish check: ${action.reason}\n`);
  }

  appendFileSync(output, `publish=${actions.some((action) => action.kind === 'publish')}\n`);

  process.exitCode = actions.some((action) => action.kind === 'fail') ? 1 : 0;
}

if (import.meta.main) {
  runCLI();
}
