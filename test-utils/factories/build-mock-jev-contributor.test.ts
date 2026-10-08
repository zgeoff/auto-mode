import { expect, test } from 'bun:test';
import { buildMockJevContributor } from './build-mock-jev-contributor.ts';

test('it builds a default Jev contributor', () => {
  expect(buildMockJevContributor()).toStrictEqual({
    rule: expect.toBeString(),
    tier: 'hard',
    choice: 'block',
    confidence: 1,
    allow: 0,
    block: 1,
    ask: 0,
  });
});

test('it applies overrides on top of the defaults', () => {
  const contributor = buildMockJevContributor({
    rule: 'History Rewrite',
    tier: 'soft',
    choice: 'ask',
    confidence: 0.6,
    allow: 0.2,
    block: 0.2,
    ask: 0.6,
  });

  expect(contributor).toStrictEqual({
    rule: 'History Rewrite',
    tier: 'soft',
    choice: 'ask',
    confidence: 0.6,
    allow: 0.2,
    block: 0.2,
    ask: 0.6,
  });
});
