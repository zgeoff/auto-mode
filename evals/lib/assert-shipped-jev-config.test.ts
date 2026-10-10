import { expect, test } from 'bun:test';
import { buildMockConfig } from '../../test-utils/factories/build-mock-config.ts';
import { assertShippedJevConfig } from './assert-shipped-jev-config.ts';

test('it accepts the shipped Jev policy', () => {
  expect(() => {
    assertShippedJevConfig(buildMockConfig());
  }).not.toThrow();
});

test('it rejects a Messages API provider', () => {
  expect(() => {
    assertShippedJevConfig(buildMockConfig({ provider: { protocol: 'messages' } }));
  }).toThrowWithMessage(Error, /Evaluate the shipped Jev policy with no replacement policy\.$/u);
});

test('it rejects a replacement rule list', () => {
  expect(() => {
    assertShippedJevConfig(buildMockConfig({ rulesPath: '/work/rules.md' }));
  }).toThrowWithMessage(Error, /Evaluate the shipped Jev policy with no replacement policy\.$/u);
});

test('it rejects a replacement classifier framework', () => {
  expect(() => {
    assertShippedJevConfig(buildMockConfig({ classifierPath: '/work/classifier.md' }));
  }).toThrowWithMessage(Error, /Evaluate the shipped Jev policy with no replacement policy\.$/u);
});
