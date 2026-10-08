import { expect, test } from 'bun:test';
import * as api from './index.ts';

// The package exports this set, so removing, renaming, or retyping one is a
// breaking change for a consumer that publint and the type build cannot see.
test('it exports the documented public API', () => {
  expect({ ...api }).toStrictEqual({
    DEFAULT_CONFIG: expect.toBeObject(),
    PRESETS: expect.toBeObject(),
    classifyAction: expect.toBeFunction(),
    classifyLocally: expect.toBeFunction(),
    classifyWithModel: expect.toBeFunction(),
    loadConfig: expect.toBeFunction(),
    loadPolicy: expect.toBeFunction(),
    parseActionRequest: expect.toBeFunction(),
    parseModelVerdict: expect.toBeFunction(),
    renderVerdict: expect.toBeFunction(),
    resolveApiKey: expect.toBeFunction(),
    resolveConfigPath: expect.toBeFunction(),
  });
});
