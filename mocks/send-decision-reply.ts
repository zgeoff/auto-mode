import { HttpResponse } from 'msw';
import invariant from 'tiny-invariant';
import type { DecisionResponse } from '../src/model/decision-response-schema.ts';
import { buildMockDecisionAnswer } from '../test-utils/factories/build-mock-decision-answer.ts';
import { decisionAnswers } from './decision-answers.ts';

interface ResolverInfo {
  readonly request: Readonly<Pick<Request, 'json'>>;
}

interface DecisionRefusalBody {
  readonly detail: { readonly error_type: 'api_usage_error'; readonly message: string };
}

interface DecisionValidationIssue {
  readonly type: string;
  readonly loc: readonly (string | number)[];
  readonly msg: string;
  readonly input: unknown;
  readonly ctx?: Readonly<Record<string, unknown>>;
}

interface DecisionValidationBody {
  readonly detail: readonly DecisionValidationIssue[];
}

type DecisionReplyBody = DecisionResponse | DecisionRefusalBody | DecisionValidationBody;

// Most suites want Jev to clear every rule, so a question with no answer set
// gets a certain allow.
export async function sendDecisionReply(
  info: Readonly<ResolverInfo>,
): Promise<HttpResponse<DecisionReplyBody>> {
  let json: unknown;

  try {
    json = await info.request.json();
  } catch {
    // Jev also reports the character position and its parser's message, which
    // a JavaScript parser cannot reproduce.
    return HttpResponse.json<DecisionValidationBody>(
      { detail: [{ type: 'json_invalid', loc: ['body'], msg: 'JSON decode error', input: {} }] },
      { status: 422 },
    );
  }

  if (!isPlainObject(json)) {
    return HttpResponse.json<DecisionValidationBody>(
      {
        detail: [
          {
            type: 'model_attributes_type',
            loc: ['body'],
            msg: 'Input should be a valid dictionary or object to extract fields from',
            input: json,
          },
        ],
      },
      { status: 422 },
    );
  }

  if (isRefusedRequest(json)) {
    return HttpResponse.json<DecisionRefusalBody>(
      { detail: { error_type: 'api_usage_error', message: 'Invalid request.' } },
      { status: 400 },
    );
  }

  const issues = collectValidationIssues(json);

  if (issues.length > 0) {
    return HttpResponse.json<DecisionValidationBody>({ detail: issues }, { status: 422 });
  }

  const questions = json['questions'];

  invariant(isPlainObject(questions), 'a request with no issue carries a question map');

  const allow = buildMockDecisionAnswer({ choice: 'allow', confidence: 1 });

  const answers = Object.fromEntries(
    Object.keys(questions).map((id) => [id, decisionAnswers.get(id) ?? allow]),
  );

  return HttpResponse.json<DecisionResponse>({
    model: 'jev-1.13.0',
    answers,
    usage: { input_tokens: 400 },
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const REQUEST_FIELDS = new Set(['model', 'state', 'questions']);

function isRefusedRequest(json: Readonly<Record<string, unknown>>): boolean {
  if (Object.keys(json).some((key) => !REQUEST_FIELDS.has(key))) {
    return true;
  }

  if (!isPlainObject(json['questions'])) {
    return false;
  }

  return Object.values(json['questions']).some(
    (question) => isPlainObject(question) && 'type' in question && question['type'] !== 'choice',
  );
}

function collectValidationIssues(
  json: Readonly<Record<string, unknown>>,
): DecisionValidationIssue[] {
  const issues: DecisionValidationIssue[] = [];

  if (json['model'] === undefined) {
    issues.push({ type: 'missing', loc: ['body', 'model'], msg: 'Field required', input: json });
  } else if (typeof json['model'] !== 'string') {
    issues.push({
      type: 'string_type',
      loc: ['body', 'model'],
      msg: 'Input should be a valid string',
      input: json['model'],
    });
  }

  if (json['state'] === undefined || json['state'] === null) {
    issues.push({ type: 'missing', loc: ['body', 'state'], msg: 'Field required', input: json });
  }

  issues.push(...collectQuestionIssues(json));

  return issues;
}

function collectQuestionIssues(json: Readonly<Record<string, unknown>>): DecisionValidationIssue[] {
  const questions = json['questions'];

  if (questions === undefined) {
    return [{ type: 'missing', loc: ['body', 'questions'], msg: 'Field required', input: json }];
  }

  if (!isPlainObject(questions)) {
    return [
      {
        type: 'dict_type',
        loc: ['body', 'questions'],
        msg: 'Input should be a valid dictionary',
        input: questions,
      },
    ];
  }

  if (Object.keys(questions).length === 0) {
    return [
      {
        type: 'too_short',
        loc: ['body', 'questions'],
        msg: 'Dictionary should have at least 1 item after validation, not 0',
        input: questions,
        ctx: { actual_length: 0, field_type: 'Dictionary', min_length: 1 },
      },
    ];
  }

  return Object.entries(questions).flatMap(([id, question]): DecisionValidationIssue[] => {
    if (!isPlainObject(question)) {
      return [
        {
          type: 'model_attributes_type',
          loc: ['body', 'questions', id],
          msg: 'Input should be a valid dictionary or object to extract fields from',
          input: question,
        },
      ];
    }

    if (!('type' in question)) {
      return [
        {
          type: 'union_tag_not_found',
          loc: ['body', 'questions', id],
          msg: "Unable to extract tag using discriminator 'type'",
          input: question,
          ctx: { discriminator: "'type'" },
        },
      ];
    }

    return [];
  });
}
