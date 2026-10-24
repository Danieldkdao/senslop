export const capacityBounds = {
  concurrency: { min: 1, max: 16 },
  requestsPerMinute: { min: 1, max: 6000 },
  inputTokensPerMinute: { min: 1024, max: 10000000 },
  outputTokensPerMinute: { min: 256, max: 2000000 },
  contextTokens: { min: 256, max: 2000000 },
  outputTokens: { min: 64, max: 64000 },
  groupingInputTokens: { min: 1024, max: 128000 },
  reviewInputTokens: { min: 1024, max: 128000 },
} as const;

export const capacityLockedMessage =
  "Capacity settings are disabled while grouping or review is queued or running. Wait for it to finish or cancel it. Saved changes apply to the next run.";
