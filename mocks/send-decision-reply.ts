import { HttpResponse } from 'msw';
import invariant from 'tiny-invariant';
import type { DecisionResponse } from '../src/model/build-decision-response-schema.ts';
import { buildMockDecisionAnswer } from '../test-utils/factories/build-mock-decision-answer.ts';
import { decisionAnswers } from './decision-answers.ts';

interface ResolverInfo {
  readonly request: Readonly<Pick<Request, 'json'>>;
}

interface DecisionRefusalBody {
  readonly detail: { readonly error_type: 'api_usage_error'; readonly message: string };
}

interface ValidationIssue {
  readonly type: string;
  readonly loc: readonly (string | number)[];
  readonly message: string;
  readonly input: unknown;
  readonly ctx?: Readonly<Record<string, unknown>>;
}

interface DecisionValidationIssue extends Omit<ValidationIssue, 'message'> {
  // oxlint-disable-next-line zgeoff/no-abbreviated-names -- the real server's 422 wire field
  readonly msg: string;
}

interface DecisionValidationBody {
  readonly detail: readonly DecisionValidationIssue[];
}

type DecisionReplyBody = DecisionResponse | DecisionRefusalBody | DecisionValidationBody;

export async function sendDecisionReply(
  info: Readonly<ResolverInfo>,
): Promise<HttpResponse<DecisionReplyBody>> {
  let json: unknown;

  try {
    json = await info.request.json();
  } catch {
    // Jev also reports the character position and its parser's message, which
    // a JavaScript parser cannot reproduce.
    return buildValidationReply([
      { type: 'json_invalid', loc: ['body'], message: 'JSON decode error', input: {} },
    ]);
  }

  if (!isPlainObject(json)) {
    return buildValidationReply([
      {
        type: 'model_attributes_type',
        loc: ['body'],
        message: 'Input should be a valid dictionary or object to extract fields from',
        input: json,
      },
    ]);
  }

  if (isRefusedRequest(json)) {
    return HttpResponse.json<DecisionRefusalBody>(
      { detail: { error_type: 'api_usage_error', message: 'Invalid request.' } },
      { status: 400 },
    );
  }

  const issues = collectValidationIssues(json);

  if (issues.length > 0) {
    return buildValidationReply(issues);
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

function buildValidationReply(
  issues: readonly ValidationIssue[],
): HttpResponse<DecisionValidationBody> {
  const detail = issues.map((issue) => {
    const { message, ...fields } = issue;

    // oxlint-disable-next-line zgeoff/no-abbreviated-names -- the real server's 422 wire field
    return { ...fields, msg: message };
  });

  return HttpResponse.json<DecisionValidationBody>({ detail }, { status: 422 });
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

function collectValidationIssues(json: Readonly<Record<string, unknown>>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (json['model'] === undefined) {
    issues.push({
      type: 'missing',
      loc: ['body', 'model'],
      message: 'Field required',
      input: json,
    });
  } else if (typeof json['model'] !== 'string') {
    issues.push({
      type: 'string_type',
      loc: ['body', 'model'],
      message: 'Input should be a valid string',
      input: json['model'],
    });
  }

  if (json['state'] === undefined || json['state'] === null) {
    issues.push({
      type: 'missing',
      loc: ['body', 'state'],
      message: 'Field required',
      input: json,
    });
  }

  issues.push(...collectQuestionIssues(json));

  return issues;
}

function collectQuestionIssues(json: Readonly<Record<string, unknown>>): ValidationIssue[] {
  const questions = json['questions'];

  if (questions === undefined) {
    return [
      { type: 'missing', loc: ['body', 'questions'], message: 'Field required', input: json },
    ];
  }

  if (!isPlainObject(questions)) {
    return [
      {
        type: 'dict_type',
        loc: ['body', 'questions'],
        message: 'Input should be a valid dictionary',
        input: questions,
      },
    ];
  }

  if (Object.keys(questions).length === 0) {
    return [
      {
        type: 'too_short',
        loc: ['body', 'questions'],
        message: 'Dictionary should have at least 1 item after validation, not 0',
        input: questions,
        ctx: { actual_length: 0, field_type: 'Dictionary', min_length: 1 },
      },
    ];
  }

  return Object.entries(questions).flatMap(([id, question]): ValidationIssue[] => {
    if (!isPlainObject(question)) {
      return [
        {
          type: 'model_attributes_type',
          loc: ['body', 'questions', id],
          message: 'Input should be a valid dictionary or object to extract fields from',
          input: question,
        },
      ];
    }

    if (!('type' in question)) {
      return [
        {
          type: 'union_tag_not_found',
          loc: ['body', 'questions', id],
          message: "Unable to extract tag using discriminator 'type'",
          input: question,
          ctx: { discriminator: "'type'" },
        },
      ];
    }

    return [];
  });
}
