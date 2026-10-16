import { z } from "zod";
import {
  providerConfigSchema,
  type ProviderConfigSchema,
} from "@senslop/contracts";

import { readProviderAccessError, readProviderJson } from "./provider-http";

const catalogModelSchema = z.object({
  id: z.string().max(200).optional(),
  name: z.string().max(200).optional(),
});
export type CatalogModelSchema = z.infer<typeof catalogModelSchema>;
const catalogSchema = z.object({
  data: z.array(catalogModelSchema).max(20000).optional(),
  models: z.array(catalogModelSchema).max(20000).optional(),
});
export type CatalogSchema = z.infer<typeof catalogSchema>;

export const probeConnection = async (
  input: ProviderConfigSchema,
  secret: string | null,
  operation: "test" | "models",
  fetcher: typeof fetch = fetch,
) => {
  const connection = providerConfigSchema.parse(input);
  const headers: Record<string, string> = { Accept: "application/json" };
  let path = "/models";
  switch (connection.provider) {
    case "google":
      if (secret) headers["x-goog-api-key"] = secret;
      break;
    case "anthropic":
      if (secret) headers["x-api-key"] = secret;
      headers["anthropic-version"] = "2023-06-01";
      break;
    case "ollama":
      path = "/api/tags";
      if (secret) headers.Authorization = `Bearer ${secret}`;
      break;
    case "openrouter":
      if (operation === "test") path = "/key";
      if (secret) headers.Authorization = `Bearer ${secret}`;
      break;
    default:
      if (secret) headers.Authorization = `Bearer ${secret}`;
  }
  const url = connection.baseURL.replace(/\/$/, "") + path;
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "GET",
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error(
      "Provider server is unavailable or timed out. Check the URL, start the server if needed, and retry.",
    );
  }
  if (response.status === 401 || response.status === 403)
    throw new Error(
      (await readProviderAccessError(response, connection.provider)) ??
        "Provider rejected the credentials. Check your API key and endpoint.",
    );
  if ([404, 405, 501].includes(response.status))
    return {
      supported: false,
      models: [],
      message:
        "This server does not support this metadata endpoint. Credentials have not been verified.",
    };
  if (!response.ok)
    throw new Error(
      `Provider metadata request failed with HTTP ${response.status}. Retry after checking the server.`,
    );
  let payload: unknown;
  try {
    payload = await readProviderJson(response);
  } catch {
    throw new Error(
      "Provider returned invalid or oversized metadata. Retry after checking the endpoint.",
    );
  }
  if (connection.provider === "openrouter" && operation === "test") {
    if (!payload || typeof payload !== "object" || !("data" in payload))
      throw new Error("Provider returned invalid key metadata.");
    return {
      supported: true,
      models: [],
      message: "API key accepted. No repository source was sent.",
    };
  }
  const parsedCatalog = catalogSchema.safeParse(payload);
  if (!parsedCatalog.success)
    throw new Error(
      "Provider returned invalid model metadata. Retry after checking the endpoint.",
    );
  const catalog: CatalogSchema = parsedCatalog.data;
  const entries: CatalogModelSchema[] | undefined =
    catalog.data ?? catalog.models;
  if (!entries)
    return {
      supported: false,
      models: [],
      message:
        "Model listing is unsupported. Credentials have not been verified.",
    };
  const models = [
    ...new Set(
      entries
        .map((model) => model.id ?? model.name ?? "")
        .map((id) =>
          connection.provider === "google" ? id.replace(/^models\//, "") : id,
        )
        .filter((id) => id && (!secret || !id.includes(secret))),
    ),
  ].slice(0, 1000);
  const publicCatalog =
    connection.provider === "vercel" ||
    connection.provider === "opencode" ||
    connection.provider === "openrouter";
  return {
    supported: true,
    models,
    message: publicCatalog
      ? "Model catalog reachable. This endpoint may be public; credentials are not verified by model discovery. No repository source was sent."
      : `Connection metadata received. ${models.length} models available. No repository source was sent.`,
  };
};
