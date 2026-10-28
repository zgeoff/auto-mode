import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as z from 'zod';
import type { PublishAction } from './pick-publish-action.ts';
import { pickPublishAction } from './pick-publish-action.ts';
import type { RunProgram } from './run-program.ts';
import { runProgram } from './run-program.ts';

export interface PublishCheckOptions {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;

  // owner/name, as GITHUB_REPOSITORY holds it.
  readonly repository: string;

  // The release the release job tagged in this run, when it tagged one.
  readonly release: { readonly tag: string; readonly version: string } | undefined;

  readonly canPublishHere: boolean;
  readonly runProgram: RunProgram;
}

// The check covers the release this run tagged and the version the checkout holds: release-please
// tags the release PR it merges after this run's push, so the run on the release commit reports no
// release created, and each candidate gets a run at its tag.
export function runPublishCheck(options: Readonly<PublishCheckOptions>): PublishAction[] {
  const run = { cwd: options.cwd, env: options.env };
  const text = readFileSync(join(options.cwd, 'package.json'), 'utf8');
  const manifest = manifestSchema.parse(JSON.parse(text));
  const head = options.runProgram(['git', 'rev-parse', 'HEAD'], run);

  if (head.exitCode !== 0) {
    throw new Error(`git rev-parse HEAD failed: ${head.stderr.trim()}`);
  }

  // release-please tags a node package <name>-v<version>.
  const candidates = new Map([
    ...(options.release === undefined
      ? []
      : [[options.release.tag, options.release.version] as const]),
    [`${manifest.name}-v${manifest.version}`, manifest.version] as const,
  ]);

  return [...candidates].map(([tag, version]) => {
    const action = pickPublishAction({
      name: manifest.name,
      version,
      tag,
      head: head.stdout.trim(),
      canPublishHere: options.canPublishHere,
      registry: options.runProgram(
        ['npm', 'view', `${manifest.name}@${version}`, 'version', '--json'],
        run,
      ),
      tagLookup: options.runProgram(
        ['git', 'ls-remote', '--exit-code', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`],
        run,
      ),
    });

    return action.kind === 'dispatch' ? runPublishDispatch(options, tag, action) : action;
  });
}

const manifestSchema = z.object({ name: z.string(), version: z.string() });

function runPublishDispatch(
  options: Readonly<PublishCheckOptions>,
  tag: string,
  action: PublishAction,
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
      tag,
      '-f',
      'republish=true',
    ],
    { cwd: options.cwd, env: options.env },
  );

  if (result.exitCode !== 0) {
    return { kind: 'fail', reason: `gh workflow run at ${tag} failed: ${result.stderr.trim()}` };
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

  const tag = process.env['RELEASE_TAG'] ?? '';
  const version = process.env['RELEASE_VERSION'] ?? '';

  const actions = runPublishCheck({
    cwd: process.cwd(),
    env: process.env,
    repository,
    release: tag === '' || version === '' ? undefined : { tag, version },
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
