import "server-only";
import { createHash } from "node:crypto";
import {
  APICallError,
  createGateway,
  wrapLanguageModel,
  type LanguageModel,
} from "ai";
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
import {
  AiServiceError,
  formatAiError,
  getAiErrorStatus,
  isRetryableAiError,
  getAiProviderBackoff,
} from "./errors";
import { getOpenCodeProtocol } from "./opencode-protocol";
import { getRequestLimiter } from "./request-limiter";
import { estimateInputTokenUpperBound } from "./context-budget";

type ResolvedLanguageModel = {
  model: LanguageModel;
  requestLimiter?: ReturnType<typeof getRequestLimiter>;
  providerOptions?: {
    ollama: { options: { num_ctx: number; num_predict: number } };
  };
};

export const getGenerationOptions = (
  connection: Pick<ProviderConfigSchema, "provider" | "contextWindow">,
  limit: number,
  answerTokens: number,
) => {
  // OpenRouter counts reasoning and the final answer against the same completion limit.
  const maxOutputTokens = Math.min(
    answerTokens * (connection.provider === "openrouter" ? 2 : 1),
    Math.max(64, Math.floor(limit / 4)),
  );
  return {
    maxOutputTokens,
    providerOptions: {
      openai: { store: false },
      ...(connection.provider === "openrouter"
        ? {
            openrouter: {
              reasoning: { max_tokens: Math.floor(maxOutputTokens / 2) },
            },
          }
        : {}),
      ...(connection.provider === "ollama"
        ? {
            ollama: {
              options: {
                ...(connection.contextWindow
                  ? { num_ctx: connection.contextWindow }
                  : {}),
                num_predict: maxOutputTokens,
              },
            },
          }
        : {}),
    },
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
  const rethrowOpenRouterError = (error: unknown): never => {
    if (!APICallError.isInstance(error)) throw error;
    const statusCode = getAiErrorStatus(error) ?? undefined;
    const retryable = isRetryableAiError(error);
    // OpenRouter can return upstream errors inside HTTP 200; retain only safe diagnostics.
    const responseHeaders = error.responseHeaders
      ? Object.fromEntries(
          Object.entries(error.responseHeaders).filter(([name]) =>
            [
              "retry-after",
              "retry-after-ms",
              "x-generation-id",
              "request-id",
            ].includes(name.toLowerCase()),
          ),
        )
      : undefined;
    console.warn("[senslop:ai-provider]", {
      provider: "openrouter",
      modelId,
      statusCode,
      transportStatus: error.statusCode,
      retryable,
      generationId: responseHeaders?.["x-generation-id"],
    });
    throw new APICallError({
      message: formatAiError(error),
      url: error.url,
      requestBodyValues: undefined,
      statusCode,
      responseHeaders,
      isRetryable: retryable,
      data: { code: statusCode, limitKind: getAiProviderBackoff(error)?.kind },
    });
  };
  const createModel = () => {
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
        return {
          model: wrapLanguageModel({
            model: createOpenRouter(options)(modelId),
            middleware: {
              specificationVersion: "v4",
              wrapGenerate: ({ doGenerate }) =>
                Promise.resolve()
                  .then(doGenerate)
                  .catch(rethrowOpenRouterError),
              wrapStream: ({ doStream }) =>
                Promise.resolve().then(doStream).catch(rethrowOpenRouterError),
            },
          }),
        };
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
            supportsStructuredOutputs: true,
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
  const resolved = createModel();
  // Google keys can share a project quota; conservatively share its endpoint budget across credentials.
  const key = createHash("sha256")
    .update(
      JSON.stringify({
        provider: connection.provider,
        endpoint: options.baseURL,
        credential:
          connection.provider === "google" ? "shared-google-budget" : apiKey,
      }),
    )
    .digest("hex");
  const limiter = getRequestLimiter(key, connection.provider);
  return {
    ...resolved,
    requestLimiter: limiter,
    model: wrapLanguageModel({
      model: resolved.model,
      middleware: {
        specificationVersion: "v4",
        transformParams: async ({ params }) => {
          if (params.responseFormat?.type !== "json") return params;
          const googleSchema =
            connection.provider === "google" ||
            (connection.provider === "opencode" &&
              getOpenCodeProtocol(modelId) === "gemini") ||
            (connection.provider === "vercel" && modelId.startsWith("google/"));
          // Expanding array bounds can exceed Google's schema complexity limit.
          // Keep empty-array constraints; SDK validation enforces all original bounds.
          if (googleSchema)
            return {
              ...params,
              responseFormat: JSON.parse(
                JSON.stringify(params.responseFormat, (key, value) =>
                  (key === "minItems" || key === "maxItems") &&
                  typeof value === "number" &&
                  value > 0
                    ? undefined
                    : value,
                ),
              ),
            };
          // MiMo supports JSON mode, while its Gateway adapter cannot enforce a response schema.
          if (
            connection.provider === "vercel" &&
            /^xiaomi\/mimo-/i.test(modelId)
          )
            return {
              ...params,
              responseFormat: { type: "json" },
            };
          return params;
        },
        wrapGenerate: ({ doGenerate, params }) =>
          limiter.run(doGenerate, params.abortSignal, {
            inputTokens: estimateInputTokenUpperBound({
              prompt: params.prompt,
              tools: params.tools,
              responseFormat: params.responseFormat,
            }),
            actualInputTokens: (result) => result.usage.inputTokens.total,
          }),
      },
    }),
  };
};
