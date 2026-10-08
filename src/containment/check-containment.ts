import type { ActionRequest } from '../request/types.ts';
import { collectScopeFindings } from './collect-scope-findings.ts';
import type { OwnedScope, ScopeFinding } from './collect-scope-findings.ts';

export interface ContainmentDeny {
  readonly rule: string;
  readonly reason: string;
  readonly findings: readonly ScopeFinding[];
}

const CONTAINMENT_RULE = 'Outside Task Scope';

export function checkContainment(
  request: Readonly<ActionRequest>,
  scope: Readonly<OwnedScope>,
): ContainmentDeny | null {
  const findings = collectScopeFindings(
    { tool: request.toolName, cwd: request.cwd, input: request.toolInput },
    scope,
  );

  if (findings.length === 0) {
    return null;
  }

  return { rule: CONTAINMENT_RULE, reason: formatContainmentReason(findings, scope), findings };
}

const KIND_LABELS: Readonly<Record<ScopeFinding['kind'], string>> = {
  path: 'path',
  branch: 'branch',
  'remote-write': 'remote target',
  credential: 'credential or global setting',
  prune: 'shared resource',
};

function formatContainmentReason(
  findings: readonly ScopeFinding[],
  scope: Readonly<OwnedScope>,
): string {
  const targets = findings
    .slice(0, 5)
    .map((finding) => `${KIND_LABELS[finding.kind]} ${finding.target}`)
    .join(', ');

  const more = findings.length > 5 ? ` and ${findings.length - 5} more` : '';

  const branches =
    scope.branches.length === 0 ? '' : ` and ${formatList('branch', 'branches', scope.branches)}`;

  const owned = `${formatList('worktree', 'worktrees', scope.worktrees)}${branches}`;

  return `This action writes outside the task scope: ${targets}${more}. The task owns ${owned}. Do the work inside the task's own worktree and branch, or ask the user to extend the task scope to this target.`;
}

function formatList(one: string, many: string, values: readonly string[]): string {
  return `the ${values.length === 1 ? one : many} ${values.join(', ')}`;
}
