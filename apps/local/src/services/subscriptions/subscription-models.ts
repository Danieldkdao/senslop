import { z } from "zod";
import { readProviderJson } from "../../features/providers/lib/provider-http";
import type { ModelCatalogSchema } from "../../features/providers/model-schemas";

const chatGptCatalogSchema = z.object({
  models: z
    .array(
      z.object({
        slug: z.string().min(1).max(200),
        display_name: z.string().min(1).max(200),
        visibility: z.string(),
        available: z.boolean().optional(),
        is_available: z.boolean().optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .max(20000),
});
export type ChatGptCatalogSchema = z.infer<typeof chatGptCatalogSchema>;

export const discoverChatGptModels = async (
  accessToken: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<ModelCatalogSchema> => {
  const response = await fetcher("https://api.openai.com/v1/models", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    redirect: "error",
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403)
    throw new Error(
      "ChatGPT account access expired or is unavailable. Sign in again.",
    );
  if (!response.ok)
    throw new Error(
      "ChatGPT models are temporarily unavailable. Retry model discovery.",
    );
  const result = chatGptCatalogSchema.safeParse(
    await readProviderJson(response),
  );
  if (!result.success)
    throw new Error(
      "ChatGPT returned an unsupported model catalog. Retry later.",
    );
  return {
    models: result.data.models
      .filter(
        (model) =>
          model.visibility === "list" &&
          model.available !== false &&
          model.is_available !== false &&
          model.enabled !== false,
      )
      .map((model) => ({
        id: model.slug,
        name: model.display_name,
        available: true,
      })),
    source: "live",
    manualAllowed: false,
    message: null,
  };
};
