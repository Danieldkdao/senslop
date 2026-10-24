import type { ProviderId, CompatibleModelSchema } from "@senslop/contracts";

export const defaultCompatibleModel: CompatibleModelSchema = {
  id: "",
  maxCompletionTokens: 200000,
  maxOutputTokens: 32000,
  contextWindow: 200000,
  supportsTools: true,
  supportsImages: false,
  supportsParallelToolCalls: false,
  supportsPromptCacheKey: false,
  supportsChatCompletions: true,
  usesMaxTokens: false,
  supportsThinking: false,
};

export const compatibleModelCapabilities = [
  "supportsTools",
  "supportsImages",
  "supportsParallelToolCalls",
  "supportsPromptCacheKey",
  "supportsChatCompletions",
  "usesMaxTokens",
  "supportsThinking",
] as const;

// Chat fallbacks checked against official provider docs on October 10, 2026.
export const getFallbackModelIds = (
  provider: ProviderId,
): readonly string[] => {
  switch (provider) {
    case "chatgpt":
      return [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.5",
        "gpt-5.4-mini",
        "gpt-5.4-nano",
      ];
    case "anthropic":
      return [
        "claude-opus-5-5",
        "claude-sonnet-5-5",
        "claude-haiku-5-5",
        "claude-sonnet-4-6",
        "claude-opus-4-6",
      ];
    case "google":
      return [
        "gemini-3.8-flash",
        "gemini-3.5-flash",
        "gemini-3.5-flash-lite",
        "gemini-3.1-pro",
        "gemini-3-flash",
      ];
    case "grok":
      return ["grok-4.7", "grok-4.6", "grok-4.5", "grok-4", "grok-3-mini"];
    case "mistral":
      return [
        "mistral-large-latest",
        "mistral-medium-latest",
        "mistral-small-latest",
        "ministral-14b-latest",
        "ministral-8b-latest",
        "ministral-3b-latest",
      ];
    case "deepseek":
      return [
        "deepseek-chat",
        "deepseek-reasoner",
        "deepseek-v4-pro",
        "deepseek-v4-flash",
      ];
    default:
      return [];
  }
};
