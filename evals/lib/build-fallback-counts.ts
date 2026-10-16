import type { FallbackCount } from './run-summary-schema.ts';
import type { SampleRecord } from './sample-record-schema.ts';

// A model alias resolves to a canonical model ID, so a fallback is the one the
// transport flagged, never a name that differs from the stage's model. A reply
// to a request that named another model is a model change, not a fallback.
export function buildFallbackCounts(
  records: readonly SampleRecord[],
  models: Readonly<Record<string, string>>,
): FallbackCount[] {
  return Object.entries(models).flatMap(([stage, model]) => {
    const answered = records.filter(
      (record) =>
        record.stage === stage &&
        typeof record.model === 'string' &&
        record.reason !== 'model-changed',
    );

    if (answered.length === 0) {
      return [];
    }

    const fallbacks = answered.flatMap((record) =>
      record.fallback === true && typeof record.model === 'string' ? [record.model] : [],
    );

    const counted: Record<string, number> = {};

    for (const answering of fallbacks) {
      counted[answering] = (counted[answering] ?? 0) + 1;
    }

    return [
      { stage, model, answered: answered.length, fallbacks: fallbacks.length, models: counted },
    ];
  });
}
