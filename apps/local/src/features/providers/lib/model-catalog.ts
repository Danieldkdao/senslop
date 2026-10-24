import { z } from "zod";
import {
  isLocalEndpoint,
  type ProviderConfigSchema,
  type ProviderId,
} from "@senslop/contracts";
import { AiServiceError } from "../../../services/ai/errors";
import { getOpenCodeProtocol } from "../../../services/ai/opencode-protocol";
import type { CatalogModelSchema, ModelCatalogSchema } from "../model-schemas";
import { getFallbackModelIds } from "../constants";
import { formatModelName } from "./formatters";
import { readProviderAccessError, readProviderJson } from "./provider-http";
import { normalizeModels } from "./normalize-models";

const metadataModelSchema = z.object({
  id: z.string().max(200).optional(),
  name: z.string().max(200).optional(),
  display_name: z.string().max(200).optional(),
  displayName: z.string().max(200).optional(),
  aliases: z.array(z.string().max(200)).max(20000).optional(),
  type: z.string().optional(),
  supportedGenerationMethods: z.array(z.string()).optional(),
  capabilities: z
    .union([
      z.object({ completion_chat: z.boolean().optional() }),
      z.array(z.string()),
    ])
    .optional(),
  architecture: z
    .object({ output_modalities: z.array(z.string()).optional() })
    .optional(),
});
export type MetadataModelSchema = z.infer<typeof metadataModelSchema>;
const metadataCatalogSchema = z
  .object({
    data: z.array(metadataModelSchema).max(20000).optional(),
    models: z.array(metadataModelSchema).max(20000).optional(),
    nextPageToken: z.string().max(2048).optional(),
    has_more: z.boolean().optional(),
    last_id: z.string().max(200).nullable().optional(),
  })
  .refine((value) => !!(value.data ?? value.models));
export type MetadataCatalogSchema = z.infer<typeof metadataCatalogSchema>;

const isChatModel = (
  provider: ProviderId,
  model: MetadataModelSchema,
  id: string,
) => {
  if (
    model.type &&
    [
      "embedding",
      "embeddings",
      "image",
      "speech",
      "transcription",
      "reranking",
      "reranker",
    ].includes(model.type)
  )
    return false;
  // Catalog type has provider-specific meaning; Mistral uses base/fine-tuned.
  if (
    provider === "vercel" &&
    model.type &&
    !["language", "chat", "model"].includes(model.type)
  )
    return false;
  if (Array.isArray(model.capabilities)) {
    if (provider === "ollama" && !model.capabilities.includes("completion"))
      return false;
  } else if (model.capabilities?.completion_chat === false) return false;
  if (
    model.architecture?.output_modalities &&
    !model.architecture.output_modalities.includes("text")
  )
    return false;
  if (provider === "google")
    return (
      model.supportedGenerationMethods?.includes("generateContent") ??
      /^gemini-/.test(id)
    );
  if (
    /(embed|whisper|tts|transcri|image|moderation|realtime|audio|dall-e)/i.test(
      id,
    )
  )
    return false;
  if (provider === "chatgpt")
    return (
      /^(gpt-|chatgpt-|o[1-9](?:-|$))/.test(id) &&
      !/instruct|search|computer-use/.test(id)
    );
  return true;
};

export const discoverModels = async (
  connection: ProviderConfigSchema,
  secret: string | null,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<ModelCatalogSchema> => {
  const provider = connection.provider;
  if (provider === "openai-compatible")
    return {
      models: normalizeModels(
        (connection.models ?? []).map((model) => ({
          id: model.id,
          name: model.id,
          available: true,
        })),
      ),
      source: "manual",
      manualAllowed: false,
      message:
        "Models configured for this compatible API. Capabilities and limits come from your provider settings.",
    };
  const headers: Record<string, string> = { Accept: "application/json" };
  if (secret) {
    if (provider === "google") headers["x-goog-api-key"] = secret;
    else if (provider === "anthropic") headers["x-api-key"] = secret;
    else headers.Authorization = `Bearer ${secret}`;
  }
  if (provider === "anthropic") headers["anthropic-version"] = "2023-06-01";
  const abortSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(10000)])
    : AbortSignal.timeout(10000);
  const base = connection.baseURL.replace(/\/$/, "");
  const url = new URL(base + (provider === "ollama" ? "/api/tags" : "/models"));
  const models = new Map<string, CatalogModelSchema>();
  const pages = new Set<string>();
  const manual = (message: string): ModelCatalogSchema => ({
    models: [],
    source: "manual",
    manualAllowed: true,
    message,
  });
  const unsupported = (): ModelCatalogSchema => {
    const fallback = getFallbackModelIds(provider);
    return fallback.length
      ? {
          models: normalizeModels(
            fallback.map((id) => ({
              id,
              name: formatModelName(id),
              available: true,
            })),
          ),
          source: "curated",
          manualAllowed: true,
          message:
            "Model discovery is unsupported. Showing a curated list; account availability is checked when you send.",
        }
      : manual(
          "Model discovery is unsupported. Enter an exact model ID or retry.",
        );
  };
  while (true) {
    abortSignal.throwIfAborted();
    if (pages.size >= 100 || pages.has(url.href))
      throw new AiServiceError(
        "Provider returned incomplete model pagination. Retry after checking the endpoint.",
        502,
      );
    pages.add(url.href);
    let response: Response;
    try {
      response = await fetcher(url.href, {
        headers,
        redirect: "error",
        signal: abortSignal,
        cache: "no-store",
      });
    } catch {
      if (signal?.aborted) throw signal.reason;
      if (["llama-cpp", "lm-studio", "ollama"].includes(provider))
        return manual(
          "Server unavailable or timed out. Start the server, retry, or enter its exact model ID.",
        );
      throw new AiServiceError(
        "Provider server is unavailable or timed out. Retry after checking the endpoint.",
        503,
      );
    }
    if ([401, 403].includes(response.status))
      throw new AiServiceError(
        (await readProviderAccessError(response, provider)) ??
          "Provider rejected the credentials. Update the key in Configure and retry.",
        422,
      );
    if ([404, 405, 501].includes(response.status)) return unsupported();
    if (!response.ok)
      throw new AiServiceError(
        `Provider model discovery failed with HTTP ${response.status}. Retry after checking your provider account.`,
        502,
      );
    let catalog: MetadataCatalogSchema;
    try {
      catalog = metadataCatalogSchema.parse(await readProviderJson(response));
    } catch {
      throw new AiServiceError(
        "Provider returned invalid or oversized model metadata. Retry after checking the endpoint.",
        502,
      );
    }
    for (const model of catalog.data ?? catalog.models ?? []) {
      const id = (model.id ?? model.name ?? "")
        .replace(provider === "google" ? /^models\// : /^$/, "")
        .trim();
      if (
        !id ||
        /[\s\x00-\x1f\x7f]/.test(id) ||
        (secret && JSON.stringify(model).includes(secret)) ||
        !isChatModel(provider, model, id)
      )
        continue;
      if (!models.has(id))
        models.set(id, {
          id,
          name:
            model.display_name ??
            model.displayName ??
            (model.id ? model.name : undefined) ??
            formatModelName(id),
          available:
            provider !== "opencode" || getOpenCodeProtocol(id) !== null,
          ...(model.aliases?.length
            ? { aliases: model.aliases.map((alias) => alias.trim()) }
            : {}),
        });
      if (models.size > 20000)
        throw new AiServiceError(
          "Provider returned too many models. Check the endpoint.",
          502,
        );
    }
    if (provider === "google" && catalog.nextPageToken)
      url.searchParams.set("pageToken", catalog.nextPageToken);
    else if (provider === "anthropic" && catalog.has_more && catalog.last_id)
      url.searchParams.set("after_id", catalog.last_id);
    else {
      if (catalog.has_more)
        throw new AiServiceError(
          "Provider returned incomplete model pagination. Check the endpoint.",
          502,
        );
      break;
    }
  }
  return {
    models: normalizeModels(
      [...models.values()].map((model) => ({
        ...model,
        ...(model.aliases
          ? { aliases: model.aliases.filter((alias) => models.has(alias)) }
          : {}),
      })),
    ),
    source: "live",
    manualAllowed:
      isLocalEndpoint(connection.baseURL) ||
      ["llama-cpp", "lm-studio", "ollama"].includes(provider),
    message: models.size
      ? null
      : "No text chat models were found. Check your server or provider account.",
  };
};
