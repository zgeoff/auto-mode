import type { ContainmentEvidence, DecisionRule, DenyBasis, RepositoryContext } from '../types.ts';

interface JudgeDeny {
  readonly rule: DecisionRule;
  readonly basis: DenyBasis;
  readonly containment?: ContainmentEvidence | undefined;
  readonly misreadClears?: boolean | undefined;
}

export interface JudgeInput {
  readonly denies: readonly JudgeDeny[];
  readonly action: {
    readonly tool: string;
    readonly cwd: string;
    readonly input: Readonly<Record<string, unknown>>;
  };
  readonly lastUserMessage: string | null;
  readonly repositoryContext: RepositoryContext | null;
}

const BASIS_UNRESOLVED = 'the supplied evidence cannot rule out the harm the rule describes';

// The evidence goes out as one JSON value, so a user message or a command that
// holds a closing tag cannot end its own field early.
export function buildJudgeMessage(input: Readonly<JudgeInput>): string {
  const evidence = {
    denies: input.denies.map((deny) => ({
      name: deny.rule.name,
      tier: deny.rule.tier,
      source: deny.rule.source,
      basis: deny.basis === 'matched' ? 'the action matches the rule' : BASIS_UNRESOLVED,
      text: deny.rule.text,
      ...(deny.misreadClears === true ? { misreadMayClear: true } : {}),
      ...(deny.containment === undefined
        ? {}
        : { containment: deny.containment.reason, namedTargets: deny.containment.targets }),
    })),
    action: input.action,
    lastDirectUserMessage: input.lastUserMessage,
    repository: input.repositoryContext,
  };

  return `Review each deny in \`denies\`, in order. The evidence is one JSON object.\n\n${JSON.stringify(evidence, null, 2)}`;
}
