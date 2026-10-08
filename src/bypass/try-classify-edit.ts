import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { resolveConfigPath } from '../config/config.ts';
import type { HostEnvironment } from '../config/types.ts';
import type { OwnedScope } from '../containment/collect-scope-findings.ts';
import type { ActionRequest } from '../request/types.ts';
import type { Checkout } from '../scope/find-checkout.ts';
import { findCheckout } from '../scope/find-checkout.ts';
import { resolveStateDir } from '../state/resolve-state-dir.ts';
import type { EditClassification } from './classify-edit.ts';
import { getEditFields } from './get-edit-fields.ts';
import { resolveEditTarget } from './resolve-edit-target.ts';

export interface EditFileReader {
  readonly resolveEditTarget: (path: string) => Promise<string | null>;
  readonly findCheckout: (
    directory: string,
    env: HostEnvironment['env'],
  ) => Promise<Checkout | null>;
  readonly readFile: (path: string) => Promise<string>;
}

const DISK_EDIT_FILE_READER: EditFileReader = {
  resolveEditTarget,
  findCheckout,
  readFile: (path) => readFile(path, 'utf8'),
};

// With these set, git reads another checkout than the one a path sits in, so
// no target's checkout can be known.
const GIT_OVERRIDES = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR'];

export async function tryClassifyEdit(
  request: Readonly<ActionRequest>,
  scope: Readonly<OwnedScope>,
  host: Readonly<HostEnvironment>,
  files: Readonly<EditFileReader> = DISK_EDIT_FILE_READER,
): Promise<EditClassification | null> {
  const fields = getEditFields(request.toolName);
  const path = fields === null ? undefined : request.toolInput[fields.path];

  if (typeof path !== 'string' || path === '') {
    return null;
  }

  try {
    const ownDirs = [dirname(resolveConfigPath(host)), resolveStateDir(host)];
    const requested = resolve(request.cwd, path);

    const [target, worktrees, protectedDirs] = await Promise.all([
      files.resolveEditTarget(requested),
      Promise.all(scope.worktrees.map((worktree) => files.resolveEditTarget(worktree))),
      Promise.all(ownDirs.map((dir) => files.resolveEditTarget(dir))),
    ]);

    if (target === null || GIT_OVERRIDES.some((name) => host.env[name] !== undefined)) {
      return null;
    }

    const [checkout, current] = await Promise.all([
      files.findCheckout(dirname(target), host.env),
      request.toolName === 'Edit' ? files.readFile(target).catch(() => null) : null,
    ]);

    // The rule set and its regex engine add about 10 ms to a CLI start, so
    // only an edit that reaches this point loads them.
    const bypass = await import('./classify-edit.ts');

    return bypass.classifyEdit(
      {
        toolName: request.toolName,
        toolInput: request.toolInput,
        requested,
        target,
        checkout: checkout?.worktree ?? null,
        current,
      },
      {
        worktrees: worktrees.filter((worktree) => worktree !== null),
        protectedDirs: [...ownDirs, ...protectedDirs.filter((dir) => dir !== null)],
      },
    );
  } catch {
    return null;
  }
}
