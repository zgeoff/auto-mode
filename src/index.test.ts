import { expect, test } from 'bun:test';
import * as api from './index.ts';

// The package exports this set, so removing, renaming, or retyping one is a
// breaking change for a consumer that publint and the type build cannot see.
test('it exports the documented public API', () => {
  expect({ ...api }).toStrictEqual({
    classifyAction: expect.toBeFunction(),
    loadConfig: expect.toBeFunction(),
    parseActionRequest: expect.toBeFunction(),
  });
});
