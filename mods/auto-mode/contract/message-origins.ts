// Composer, Remote Control and the SDK are the prompt origins a person types
// into; any other origin is a delivery from a tool, not direct user evidence.
export const MESSAGE_ORIGINS = ['composer', 'bridge', 'sdk'] as const;
