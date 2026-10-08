import { HttpResponse } from 'msw';
import * as z from 'zod';
import type { DecisionResponse } from '../src/model/decision-response-schema.ts';
import { decisionAnswers } from './decision-answers.ts';

interface ResolverInfo {
  readonly request: Readonly<Pick<Request, 'json'>>;
}

const requestSchema = z.object({ questions: z.record(z.string(), z.unknown()) });

// Most suites want Jev to clear every rule, so a question with no answer set
// gets a certain allow.
export async function resolveDecisionReply(
  info: Readonly<ResolverInfo>,
): Promise<HttpResponse<DecisionResponse>> {
  const json: unknown = await info.request.json();

  const body = requestSchema.parse(json);

  const allow: DecisionResponse['answers'][string] = {
    type: 'choice',
    choice: 'allow',
    confidence: 1,
    probabilities: { allow: 1, block: 0, ask: 0 },
  };

  const answers = Object.fromEntries(
    Object.keys(body.questions).map((id) => [id, decisionAnswers.get(id) ?? allow]),
  );

  return HttpResponse.json<DecisionResponse>({
    model: 'jev-1.13.0',
    answers,
    usage: { input_tokens: 400 },
  });
}
