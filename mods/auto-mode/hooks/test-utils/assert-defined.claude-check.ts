import { expect, test } from 'claude-code/testing';
import { assertDefined } from './assert-defined.ts';

test('it accepts a defined value', () => {
  expect(() => {
    assertDefined(0);
  }).not.toThrow();
});

test('it throws for an undefined value', () => {
  expect(() => {
    assertDefined(undefined);
  }).toThrow('Expected a value, received undefined');
});
