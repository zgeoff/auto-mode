import { expect, test } from 'bun:test';
import * as api from './index.ts';

// The package exports this set, so removing or renaming one is a breaking
// change for a consumer that publint and the type build cannot see.
test('it exports the documented public API', () => {
  expect(Object.keys(api).toSorted()).toStrictEqual([
    'DEFAULT_CONFIG',
    'PRESETS',
    'SETTINGS_PATHS',
    'buildHookConfig',
    'classifyLocally',
    'classifyWithModel',
    'detectHarness',
    'loadConfig',
    'loadPolicy',
    'parseModelVerdict',
    'parsePayload',
    'readTranscript',
    'renderVerdict',
    'resolveApiKey',
    'resolveConfigPath',
  ]);
});

test('it exports every name as something callable or readable', () => {
  const missing = Object.entries(api).filter(([, value]) => value === undefined);

  expect(missing).toBeEmpty();
});
