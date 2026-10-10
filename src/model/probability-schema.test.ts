import { expect, test } from 'bun:test';
import { probabilitySchema } from './probability-schema.ts';

test.each([0, 0.42, 1])('it accepts %d as a probability', (value) => {
  expect(probabilitySchema.safeParse(value).data).toBe(value);
});

test.each([-0.01, 1.01])('it rejects %d as outside the unit interval', (value) => {
  expect(probabilitySchema.safeParse(value).success).toBeFalse();
});
