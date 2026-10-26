export const maximumAnalysisConcurrency = 8;
export const initialProviderConcurrency = 2;
export const providerRecoveryProbeDelayMs = 60000;
export const providerRateWindowMs = 60000;
export const googleRequestLimits = {
  inputTokensPerMinute: 250000,
  requestsPerMinute: 15,
};

export const agentStreamTimeout = {
  totalMs: 15 * 60 * 1000,
  firstChunkMs: 3 * 60 * 1000,
  chunkMs: 2 * 60 * 1000,
};

export const analysisStreamTimeout = {
  totalMs: 15 * 60 * 1000,
  firstChunkMs: 8 * 60 * 1000,
  chunkMs: 8 * 60 * 1000,
};

export const defaultAnalysisExecutionPolicy = {
  groupingInputTokens: 32000,
  groupingMaxFiles: 12,
  groupingOutputTokens: 16000,
  groupingSteps: 2,
  batchConcurrency: maximumAnalysisConcurrency,
};
