import { randomUUID } from 'node:crypto';
import type { HostEnvironment, OutputStream } from './config/types.ts';
import { writeActionDiagnostic } from './diagnostics/write-action-diagnostic.ts';
import type { ActionRequest } from './request/types.ts';

export async function writeActionFailure(
  request: ActionRequest,
  host: Readonly<HostEnvironment>,
  stderr: Readonly<OutputStream>,
): Promise<void> {
  const invocationID = randomUUID();

  await writeActionDiagnostic(request, { invocationID, status: 'started' }, host, stderr);

  await writeActionDiagnostic(
    request,
    { invocationID, status: 'failure', verdict: 'defer' },
    host,
    stderr,
  );
}
