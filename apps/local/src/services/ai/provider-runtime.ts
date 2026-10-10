import "server-only";
import { createGateway, type LanguageModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createXai } from "@ai-sdk/xai";
import { createMistral } from "@ai-sdk/mistral";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOllama } from "ollama-ai-provider-v2";
import type { ProviderConfigSchema } from "@senslop/contracts";
import { formatProvider } from "../../features/providers/lib/formatters";
import { AiServiceError } from "./errors";
import { getOpenCodeProtocol } from "./opencode-protocol";

type ResolvedLanguageModel = {
  model: LanguageModel;
  providerOptions?: {
    ollama: { options: { num_ctx: number; num_predict: number } };
  };
};

export const resolveLanguageModel = (
  connection: ProviderConfigSchema,
  apiKey: string | null,
  modelId: string,
  fetcher: typeof fetch = fetch,
): ResolvedLanguageModel => {
  if (formatProvider(connection.provider).keyRequired && !apiKey)
    throw new AiServiceError(
      "This provider requires a saved API key. Open Configure to add it.",
    );
  const safeFetch: typeof fetch = (url, init) =>
    fetcher(url, { ...init, redirect: "error" });
  const options = {
    apiKey: apiKey ?? "",
    baseURL: connection.baseURL.replace(/\/$/, ""),
    fetch: safeFetch,
  };
  switch (connection.provider) {
    case "chatgpt":
      return { model: createOpenAI(options).responses(modelId) };
    case "google":
      return { model: createGoogleGenerativeAI(options)(modelId) };
    case "anthropic":
      return { model: createAnthropic(options)(modelId) };
    case "grok":
      return { model: createXai(options).responses(modelId) };
    case "mistral":
      return { model: createMistral(options)(modelId) };
    case "deepseek":
      return { model: createDeepSeek(options)(modelId) };
    case "openrouter":
      return { model: createOpenRouter(options)(modelId) };
    case "vercel":
      return {
        model: createGateway({ apiKey: apiKey!, fetch: safeFetch })(modelId),
      };
    case "llama-cpp":
    case "lm-studio":
      return {
        model: createOpenAICompatible({
          ...options,
          apiKey: apiKey ?? undefined,
          name: connection.provider,
        }).chatModel(modelId),
      };
    case "ollama":
      return {
        model: createOllama({
          baseURL: `${options.baseURL}/api`,
          headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
          fetch: safeFetch,
        })(modelId),
        ...(connection.contextWindow
          ? {
              providerOptions: {
                ollama: {
                  options: {
                    num_ctx: connection.contextWindow,
                    num_predict: 2048,
                  },
                },
              },
            }
          : {}),
      };
    case "opencode":
      switch (getOpenCodeProtocol(modelId)) {
        case "responses":
          return { model: createOpenAI(options).responses(modelId) };
        case "messages":
          return { model: createAnthropic(options)(modelId) };
        case "gemini":
          return { model: createGoogleGenerativeAI(options)(modelId) };
        case "chat":
          return {
            model: createOpenAICompatible({
              ...options,
              name: "opencode",
            }).chatModel(modelId),
          };
        case null:
          throw new AiServiceError(
            "This OpenCode model's protocol is not supported yet. Choose another model.",
          );
      }
  }
};
