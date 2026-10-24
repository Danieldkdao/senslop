import {
  defaultLocalContextWindow,
  isLocalInferenceProvider,
  isLocalEndpoint,
  type ProviderConfigSchema,
} from "@senslop/contracts";
import type { ConnectionCapacitySchema } from "../schemas";

export const defaultConnectionCapacity = (
  connection: Pick<ProviderConfigSchema, "provider" | "contextWindow"> &
    Partial<Pick<ProviderConfigSchema, "baseURL" | "models">>,
): ConnectionCapacitySchema => {
  const local =
    isLocalInferenceProvider(connection.provider) ||
    (connection.provider === "openai-compatible" &&
      !!connection.baseURL &&
      isLocalEndpoint(connection.baseURL));
  const models =
    connection.provider === "openai-compatible"
      ? (connection.models ?? [])
      : [];
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
      connection.contextWindow ??
      (models.length
        ? Math.min(...models.map((model) => model.contextWindow))
        : local
          ? defaultLocalContextWindow
          : 128000),
    outputTokens: models.length
      ? Math.min(
          local ? 2048 : 16000,
          ...models.map((model) => model.maxOutputTokens),
        )
      : local
        ? 2048
        : 16000,
    groupingInputTokens: local ? 8000 : 32000,
    reviewInputTokens: local ? 8000 : 24000,
  };
};
