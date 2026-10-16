import type { FallbackCount } from './run-summary-schema.ts';
import type { SampleRecord } from './sample-record-schema.ts';

// A safety stop makes claude -p answer on a fallback model, so each stage counts
// the answers that another model than the one its requests named wrote. A reply
// to a request that named another model is a model change, not a fallback.
export function buildFallbackCounts(
  records: readonly SampleRecord[],
  models: Readonly<Record<string, string>>,
): FallbackCount[] {
  return Object.entries(models).flatMap(([stage, model]) => {
    const answered = records.flatMap((record) =>
      record.stage === stage &&
      typeof record.model === 'string' &&
      record.reason !== 'model-changed'
        ? [record.model]
        : [],
    );

    if (answered.length === 0) {
      return [];
    }

    const others = answered.filter((answering) => answering !== model);
    const counted: Record<string, number> = {};

    for (const answering of others) {
      counted[answering] = (counted[answering] ?? 0) + 1;
    }

    return [{ stage, model, answered: answered.length, fallbacks: others.length, models: counted }];
  });
}
