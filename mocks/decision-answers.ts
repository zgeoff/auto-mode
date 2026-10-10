import type { DecisionResponse } from '../src/model/build-decision-response-schema.ts';

// Keyed by question ID; the preload clears it after each test.
export const decisionAnswers = new Map<string, DecisionResponse['answers'][string]>();
