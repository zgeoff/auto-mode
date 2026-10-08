import { HttpResponse } from 'msw';
import * as z from 'zod';
import type { DecisionResponse } from '../src/model/decision-response-schema.ts';
import type { DecisionRequest } from '../src/model/types.ts';
import { buildMockDecisionAnswer } from '../test-utils/factories/build-mock-decision-answer.ts';
import { decisionAnswers } from './decision-answers.ts';

interface ResolverInfo {
  readonly request: Readonly<Pick<Request, 'json'>>;
}

const ruleTextsSchema = z.array(z.string());

const configuredRulesSchema = z.strictObject({
  environment: ruleTextsSchema,
  allow: ruleTextsSchema,
  soft_deny: ruleTextsSchema,
  hard_deny: ruleTextsSchema,
});

const actionSchema = z.strictObject({
  tool: z.string(),
  cwd: z.string(),
  input: z.record(z.string(), z.unknown()),
});

const stateSchema = z.object({
  policy: z.string(),
  answerGuidance: z.string(),
  rulesSource: z.enum(['shipped', 'replacement']),
  configuredRules: configuredRulesSchema,
  lastUserMessage: z.string().nullable(),
  action: actionSchema,
});

const criteriaSchema = z.strictObject({ allow: z.string(), block: z.string(), ask: z.string() });

const questionSchema = z.strictObject({
  type: z.literal('choice'),
  instructions: z.string(),
  criteria: criteriaSchema,
});

type DecisionWireRequest = Pick<DecisionRequest, 'state' | 'questions'> & {
  readonly model: string;
};

// Jev refuses a field it does not know, so a request that carries the rules must fail here too.
const requestSchema = z.strictObject({
  model: z.string(),
  state: stateSchema,
  questions: z.record(z.string(), questionSchema),
}) satisfies z.ZodType<DecisionWireRequest>;

// Most suites want Jev to clear every rule, so a question with no answer set
// gets a certain allow.
export async function sendDecisionReply(
  info: Readonly<ResolverInfo>,
): Promise<HttpResponse<DecisionResponse>> {
  const json: unknown = await info.request.json();

  const body = requestSchema.parse(json);
  const allow = buildMockDecisionAnswer({ choice: 'allow', confidence: 1 });

  const answers = Object.fromEntries(
    Object.keys(body.questions).map((id) => [id, decisionAnswers.get(id) ?? allow]),
  );

  return HttpResponse.json<DecisionResponse>({
    model: 'jev-1.13.0',
    answers,
    usage: { input_tokens: 400 },
  });
}
