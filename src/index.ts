import { classifyAction as classifyWithRuntime } from './classify-action.ts';
import type {
  ActionOutcome,
  ClassifyOptions as RuntimeClassifyOptions,
} from './classify-action.ts';
import { loadConfig as loadConfigFromHost } from './config/config.ts';
import type { Config } from './config/config.ts';
import { readHostEnvironment } from './config/read-host-environment.ts';
import { readRuntime } from './config/read-runtime.ts';
import type { HostEnvironment, OutputStream, Runtime } from './config/types.ts';
import type { ActionRequest } from './request/types.ts';

export type { ActionOutcome } from './classify-action.ts';
export type { Config } from './config/config.ts';
export { parseActionRequest } from './request/parse-action-request.ts';
export type { ActionRequest, Verdict } from './request/types.ts';

export interface ClassifyOptions extends Omit<RuntimeClassifyOptions, 'runtime' | 'stderr'> {
  readonly runtime?: Readonly<Runtime> | undefined;
  readonly stderr?: Readonly<OutputStream> | undefined;
}

// A library caller has no cli.ts to build a runtime, so the library entry
// reads the process's own for a caller that passes none.
export function classifyAction(
  request: ActionRequest,
  config: Config,
  options: Readonly<ClassifyOptions> = {},
): Promise<ActionOutcome> {
  return classifyWithRuntime(request, config, {
    ...options,
    runtime: options.runtime ?? readRuntime(),
    stderr: options.stderr ?? process.stderr,
  });
}

export function loadConfig(
  configPath?: string,
  host: Readonly<HostEnvironment> = readHostEnvironment(),
): Promise<Config> {
  return loadConfigFromHost(configPath, host);
}
