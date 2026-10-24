import {
  defaultLocalContextWindow,
  isLocalInferenceProvider,
  type ProviderConfigSchema,
} from "@senslop/contracts";
import type { ConnectionCapacitySchema } from "../schemas";

export const defaultConnectionCapacity = (
  connection: Pick<ProviderConfigSchema, "provider" | "contextWindow">,
): ConnectionCapacitySchema => {
  const local = isLocalInferenceProvider(connection.provider);
  return {
    concurrency: local
      ? 1
      : connection.provider === "claude-code" ||
          connection.provider === "chatgpt-subscription"
        ? 2
        : 8,
    requestsPerMinute: connection.provider === "google" ? 15 : null,
    inputTokensPerMinute: connection.provider === "google" ? 250000 : null,
    outputTokensPerMinute: null,
    contextTokens:
      connection.contextWindow ?? (local ? defaultLocalContextWindow : 128000),
    outputTokens: local ? 2048 : 16000,
    groupingInputTokens: local ? 8000 : 32000,
    reviewInputTokens: local ? 8000 : 24000,
  };
};
