import type { FallbackCount } from './run-summary-schema.ts';
import type { SampleRecord } from './sample-record-schema.ts';

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

    // A model alias resolves to a canonical model ID, so a model name that differs
    // from the stage's model is no sign of a fallback.
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
