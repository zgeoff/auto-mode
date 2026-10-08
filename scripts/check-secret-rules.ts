import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import invariant from 'tiny-invariant';
import * as z from 'zod';
import { findSecret } from '../src/secrets/find-secret.ts';
import { getSecretRuleSet } from '../src/secrets/get-secret-rule-set.ts';

// The samples come from Betterleaks' generator: each rule's true and false
// positives, as its own validation passes them to a one-rule detector.
const sampleSetSchema = z.object({
  rule: z.string(),
  truePositives: z.array(z.string()).nullable(),
  falsePositives: z.array(z.string()).nullable(),
  pathTruePositives: z.record(z.string(), z.string()).optional(),
  pathFalsePositives: z.record(z.string(), z.string()).optional(),
});

async function main(): Promise<void> {
  const samples = parseArgs({ options: { samples: { type: 'string' } } }).values.samples;

  invariant(samples !== undefined, 'usage: check-secret-rules --samples samples.jsonl');

  const ruleSet = getSecretRuleSet();

  const samplesText = await readFile(samples, 'utf8');

  const lines = samplesText.split('\n').filter((line) => line !== '');
  const missed: string[] = [];
  const reported: string[] = [];
  let truePositives = 0;
  let falsePositives = 0;

  for (const line of lines) {
    const set = sampleSetSchema.parse(JSON.parse(line));
    const rule = ruleSet.rules.find((candidate) => candidate.id === set.rule);

    invariant(rule !== undefined, `no rule ${set.rule}`);

    const cases = [
      ...(set.truePositives ?? []).map((text) => ({ text, path: null, expected: true })),
      ...(set.falsePositives ?? []).map((text) => ({ text, path: null, expected: false })),
      ...Object.entries(set.pathTruePositives ?? {}).map(([path, text]) => ({
        text,
        path,
        expected: true,
      })),
      ...Object.entries(set.pathFalsePositives ?? {}).map(([path, text]) => ({
        text,
        path,
        expected: false,
      })),
    ];

    for (const sample of cases) {
      const found = findSecret({ text: sample.text, path: sample.path }, [rule]) !== null;

      truePositives += sample.expected ? 1 : 0;
      falsePositives += sample.expected ? 0 : 1;

      if (sample.expected && !found) {
        missed.push(set.rule);
      } else if (!sample.expected && found) {
        reported.push(set.rule);
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        sampleSets: lines.length,
        truePositives: { total: truePositives, missed: missed.length, byRule: countByRule(missed) },
        falsePositives: {
          total: falsePositives,
          reported: reported.length,
          byRule: countByRule(reported),
        },
      },
      null,
      2,
    ),
  );
}

function countByRule(ids: readonly string[]): Record<string, number> {
  return Object.fromEntries(
    [...new Set(ids)].map((id) => [id, ids.filter((other) => other === id).length]),
  );
}

await main();
