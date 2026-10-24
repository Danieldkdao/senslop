import "server-only";
import { createHash } from "node:crypto";
import {
  APICallError,
  createGateway,
  wrapLanguageModel,
  type LanguageModel,
  type ToolSet,
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
import {
  defaultLocalContextWindow,
  isLocalInferenceProvider,
  isLocalEndpoint,
  isSubscriptionProvider,
  type ProviderAccountSchema,
  type ProviderConfigSchema,
} from "@senslop/contracts";
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
import { createChatGptSubscriptionModel } from "./chatgpt-subscription-model";
import { createClaudeSubscriptionModel } from "./claude-subscription-model";
import type { ConnectionCapacitySchema } from "../../features/ai-capacity/schemas";
import { getCompatibleModel } from "../../features/providers/lib/compatible-models";
import { createCompatibleModel } from "./compatible-provider";
import { defaultConnectionCapacity } from "../../features/ai-capacity/lib/capacity";

type ResolvedLanguageModel = {
  toolsSupported?: boolean;
  model: LanguageModel;
  createModel?: (
    tools: ToolSet,
    maxTurns: number,
    signal?: AbortSignal,
  ) => Exclude<LanguageModel, string>;
  requestLimiter?: ReturnType<typeof getRequestLimiter>;
  providerOptions?: {
    ollama: { options: { num_ctx: number; num_predict: number } };
  };
};

export const getModelContextWindow = (
  connection: Pick<ProviderConfigSchema, "provider" | "contextWindow">,
  fallback = 128000,
) =>
  connection.contextWindow ??
  (isLocalInferenceProvider(connection.provider)
    ? defaultLocalContextWindow
    : fallback);

export const getGenerationOptions = (
  connection: Pick<ProviderConfigSchema, "provider" | "contextWindow">,
  limit: number,
  answerTokens: number,
  capacity?: ConnectionCapacitySchema,
) => {
  // OpenRouter counts reasoning and the final answer against the same completion limit.
  const maxOutputTokens = Math.min(
    answerTokens * (connection.provider === "openrouter" ? 2 : 1),
    Math.max(64, Math.floor(limit / 4)),
    capacity?.outputTokens ?? Infinity,
    capacity?.outputTokensPerMinute ?? Infinity,
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
  connection: ProviderConfigSchema & { account?: ProviderAccountSchema },
  apiKey: string | null,
  modelId: string,
  fetcher: typeof fetch = fetch,
  capacity?: ConnectionCapacitySchema,
): ResolvedLanguageModel => {
  const compatible = getCompatibleModel(connection, modelId);
  const profile = capacity
    ? { ...capacity }
    : compatible
      ? defaultConnectionCapacity(connection)
      : undefined;
  const local =
    isLocalInferenceProvider(connection.provider) ||
    (!!compatible && isLocalEndpoint(connection.baseURL));
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
      case "openai-compatible":
        return {
          model: createCompatibleModel(connection, apiKey!, modelId, safeFetch),
        };
      case "chatgpt":
        return { model: createOpenAI(options).responses(modelId) };
      case "chatgpt-subscription":
        return {
          model: createChatGptSubscriptionModel(apiKey!, modelId, safeFetch),
        };
      case "claude-code":
        return { model: createClaudeSubscriptionModel(modelId, {}, 1) };
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
            fetch: (url, init) => {
              if (typeof init?.body !== "string") return safeFetch(url, init);
              const body = JSON.parse(init.body);
              // This adapter forces boolean thinking; some Ollama models accept only named levels.
              // Omit the override so the server preserves its configured model default.
              delete body.think;
              return safeFetch(url, { ...init, body: JSON.stringify(body) });
            },
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
  // Local models share endpoint memory; Google keys can share a project quota.
  const key = createHash("sha256")
    .update(
      JSON.stringify({
        provider: local ? "local-inference" : connection.provider,
        endpoint: options.baseURL,
        credential: local
          ? "shared-local-server"
          : connection.provider === "google"
            ? "shared-google-budget"
            : isSubscriptionProvider(connection.provider) && connection.account
              ? connection.account.subject
              : apiKey,
      }),
    )
    .digest("hex");
  const limiter = getRequestLimiter(key, connection.provider, profile);
  const wrapModel = (model: Exclude<LanguageModel, string>) =>
    wrapLanguageModel({
      model,
      middleware: {
        specificationVersion: "v4",
        transformParams: async ({ params }) => {
          if (compatible) {
            if (!compatible.supportsChatCompletions)
              params = {
                ...params,
                providerOptions: {
                  ...params.providerOptions,
                  openai: {
                    ...params.providerOptions?.openai,
                    forceReasoning: compatible.supportsThinking,
                  },
                },
              };
            if (
              !compatible.supportsImages &&
              params.prompt.some(
                (message) =>
                  typeof message.content !== "string" &&
                  message.content.some(
                    (part) =>
                      part.type === "file" &&
                      part.mediaType.startsWith("image/"),
                  ),
              )
            )
              throw new AiServiceError(
                "This model is configured without support for images.",
              );
            params = {
              ...params,
              maxOutputTokens: Math.min(
                params.maxOutputTokens ?? compatible.maxOutputTokens,
                compatible.maxOutputTokens,
                compatible.supportsChatCompletions
                  ? compatible.maxCompletionTokens
                  : Infinity,
              ),
              ...(compatible.supportsTools
                ? {}
                : { tools: undefined, toolChoice: { type: "none" as const } }),
              ...(compatible.supportsThinking ? {} : { reasoning: undefined }),
            };
          }
          if (profile)
            params = {
              ...params,
              maxOutputTokens: Math.min(
                params.maxOutputTokens ?? profile.outputTokens,
                profile.outputTokens,
                profile.outputTokensPerMinute ?? Infinity,
              ),
            };
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
            outputTokens: params.maxOutputTokens ?? 0,
            actualOutputTokens: (result) => result.usage.outputTokens.total,
          }),
        wrapStream: ({ doStream, params }) =>
          limiter.runStream(doStream, params.abortSignal, {
            outputTokens: params.maxOutputTokens ?? 0,
            actualInputTokens: (part) => {
              const chunk = part as {
                type: string;
                usage?: { inputTokens?: { total?: number } };
              };
              return chunk.type === "finish"
                ? chunk.usage?.inputTokens?.total
                : undefined;
            },
            actualOutputTokens: (part) => {
              const chunk = part as {
                type: string;
                usage?: { outputTokens?: { total?: number } };
              };
              return chunk.type === "finish"
                ? chunk.usage?.outputTokens?.total
                : undefined;
            },
            inputTokens: estimateInputTokenUpperBound({
              prompt: params.prompt,
              tools: params.tools,
              responseFormat: params.responseFormat,
            }),
          }),
      },
    });
  return {
    ...resolved,
    ...(compatible ? { toolsSupported: compatible.supportsTools } : {}),
    requestLimiter: limiter,
    model: wrapModel(resolved.model),
    ...(connection.provider === "claude-code"
      ? {
          createModel: (
            tools: ToolSet,
            maxTurns: number,
            signal?: AbortSignal,
          ) =>
            wrapModel(
              createClaudeSubscriptionModel(modelId, tools, maxTurns, signal),
            ),
        }
      : {}),
  };
};
