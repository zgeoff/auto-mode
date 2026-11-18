import { expect, test } from 'bun:test';
import { loadShippedRuleTiers } from './load-shipped-rule-tiers.ts';

test('it reads the tier of every block rule in the shipped policy', async () => {
  const tiers = await loadShippedRuleTiers();

  expect(tiers).toStrictEqual({
    'Data Exfiltration': 'hard',
    'Secret Persistence': 'hard',
    'Policy Tampering': 'hard',
    'Audit Tampering': 'hard',
    'Destructive Payload': 'hard',
    'Irreversible Deletion': 'soft',
    'Uncommitted Work Destruction': 'soft',
    'History Rewrite': 'soft',
    'Default Branch Write': 'soft',
    'Publish and Release': 'soft',
    'Outbound Communication': 'soft',
    'Remote Code Execution': 'soft',
    'Obfuscated Command': 'soft',
    'Network Exposure': 'soft',
    'Unnamed Destination': 'soft',
    'Shared Infrastructure': 'soft',
    'Destructive Database Operation': 'soft',
    'Persistent Configuration': 'soft',
    'Credential Exploration': 'soft',
  });
});
