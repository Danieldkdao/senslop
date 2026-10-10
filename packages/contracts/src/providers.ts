import { z } from "zod";

export const providerIds = [
  "openrouter",
  "chatgpt",
  "google",
  "anthropic",
  "grok",
  "llama-cpp",
  "lm-studio",
  "ollama",
  "vercel",
  "mistral",
  "deepseek",
  "opencode",
] as const;
export type ProviderId = (typeof providerIds)[number];

export const isLocalEndpoint = (value: string) => {
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(value).hostname,
    );
  } catch {
    return false;
  }
};

export const providerConfigSchema = z.object({
  provider: z.enum(providerIds),
  name: z.string().trim().min(1, "Name this connection.").max(100),
  baseURL: z
    .url()
    .max(2048)
    .refine((value) => {
      if (!URL.canParse(value)) return false;
      const url = new URL(value);
      return (
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        (url.protocol === "https:" ||
          (url.protocol === "http:" && isLocalEndpoint(value)))
      );
    }, "Use HTTPS, or HTTP on localhost, without URL credentials, query, or fragment."),
  model: z.string().trim().max(200),
  contextWindow: z.number().int().min(256).max(2_000_000).nullable(),
});
export type ProviderConfigSchema = z.infer<typeof providerConfigSchema>;

export const saveConnectionSchema = providerConfigSchema
  .extend({
    id: z.uuid().optional(),
    apiKey: z
      .string()
      .trim()
      .max(8192)
      .refine(
        (value) => !/[\r\n\x00]/.test(value),
        "API key contains invalid characters.",
      ),
    removeKey: z.boolean().optional(),
  })
  .strict();
export type SaveConnectionSchema = z.infer<typeof saveConnectionSchema>;

export const storedConnectionSchema = providerConfigSchema
  .extend({
    id: z.uuid(),
    credentialRef: z.uuid().nullable(),
    revision: z.number().int().nonnegative(),
  })
  .strict();
export type StoredConnectionSchema = z.infer<typeof storedConnectionSchema>;

export const publicConnectionSchema = providerConfigSchema.extend({
  id: z.uuid(),
  configured: z.boolean(),
  credentialError: z.string().nullable(),
});
export type PublicConnectionSchema = z.infer<typeof publicConnectionSchema>;
