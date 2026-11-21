import { expect, onTestFinished, test } from 'bun:test';
import { faker } from '@faker-js/faker';
import { HttpResponse, http } from 'msw';
import { buildMockDecisionAnswer } from './factories/build-mock-decision-answer.ts';
import { decisionAnswers } from './mocks/decision-answers.ts';
import { DECISION_URL } from './mocks/handlers.ts';
import { network } from './mocks/network.ts';

test('it clears every variable a git hook or a session launcher exports', () => {
  const names = [
    'AUTO_MODE_SCOPE_FILE',
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_COMMON_DIR',
    'GIT_INDEX_FILE',
    'GIT_PREFIX',
  ];

  expect(names.map((name) => process.env[name])).toSatisfyAll((value) => value === undefined);
});

test('it dates faker values from the fixed reference date', () => {
  expect(faker.date.recent({ days: 1 }).getTime()).toBeWithin(
    Date.parse('2025-12-31T00:00:00Z'),
    Date.parse('2026-01-01T00:00:01Z'),
  );
});

test('it clears the seeded decision answers when the test ends', () => {
  decisionAnswers.set('rule_0', buildMockDecisionAnswer({ choice: 'block' }));

  onTestFinished(() => {
    expect(decisionAnswers.size).toBe(0);
  });
});

test('it drops a handler the test added when the test ends', () => {
  network.use(http.post(DECISION_URL, () => HttpResponse.json({}, { status: 503 })));

  onTestFinished(async () => {
    const response = await fetch(DECISION_URL, { method: 'POST', body: '{}' });

    expect(response.status).not.toBe(503);
  });
});
