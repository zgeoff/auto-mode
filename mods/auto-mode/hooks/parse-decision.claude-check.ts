import { expect, test } from 'claude-code/testing';
import { parseDecision } from './parse-decision.ts';

test('it reads an allowance', () => {
  expect(parseDecision('{"decision":"allow"}')).toStrictEqual({ decision: 'allow' });
});

test('it reads a denial with its reason', () => {
  expect(
    parseDecision('{"decision":"deny","reason":"[Data Exfiltration] Refuse the transfer."}'),
  ).toStrictEqual({ decision: 'deny', reason: '[Data Exfiltration] Refuse the transfer.' });
});

test('it reads a denial whose fields arrive in another order', () => {
  expect(
    parseDecision('{"reason":"[Data Exfiltration] Refuse the transfer.","decision":"deny"}'),
  ).toStrictEqual({ decision: 'deny', reason: '[Data Exfiltration] Refuse the transfer.' });
});

test('it reads no verdict from empty output', () => {
  expect(parseDecision('')).toBeNull();
});

test('it reads no verdict from output that is not JSON', () => {
  expect(parseDecision('not-json synthetic-private-fragment')).toBeNull();
});

test('it reads no verdict from a JSON null', () => {
  expect(parseDecision('null')).toBeNull();
});

test('it reads no verdict from a verdict that is an array', () => {
  expect(parseDecision('[{"decision":"allow"}]')).toBeNull();
});

test("it reads no verdict from output that carries its decision in Claude Code's hook field", () => {
  expect(parseDecision('{"permissionDecision":"allow"}')).toBeNull();
});

test('it reads no verdict from a decision other than allow or deny', () => {
  expect(parseDecision('{"decision":"ask"}')).toBeNull();
});

test('it reads no verdict from an allowance with a text reason', () => {
  expect(parseDecision('{"decision":"allow","reason":"Read-only action."}')).toBeNull();
});

test('it reads no verdict from an allowance with an unknown field', () => {
  expect(parseDecision('{"decision":"allow","rule":"Read-only actions"}')).toBeNull();
});

test('it reads no verdict from a denial without a reason', () => {
  expect(parseDecision('{"decision":"deny"}')).toBeNull();
});

test('it reads no verdict from a denial with a blank reason', () => {
  expect(parseDecision('{"decision":"deny","reason":"  "}')).toBeNull();
});

test('it reads no verdict from a denial whose reason is not text', () => {
  expect(parseDecision('{"decision":"deny","reason":42}')).toBeNull();
});

test('it reads no verdict from a denial with an unknown field', () => {
  expect(
    parseDecision(
      '{"decision":"deny","reason":"[Data Exfiltration] Refuse the transfer.","extra":true}',
    ),
  ).toBeNull();
});
