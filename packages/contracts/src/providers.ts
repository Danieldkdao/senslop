import { z } from "zod";
import { compatibleModelsSchema } from "./compatible-models";

export const providerIds = [
  "openrouter",
  "chatgpt",
  "chatgpt-subscription",
  "claude-code",
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
  "openai-compatible",
] as const;
export type ProviderId = (typeof providerIds)[number];

export const localInferenceProviders = [
  "llama-cpp",
  "lm-studio",
  "ollama",
] as const;
export type LocalInferenceProvider = (typeof localInferenceProviders)[number];
export const isLocalInferenceProvider = (
  provider: string,
): provider is LocalInferenceProvider =>
  localInferenceProviders.some((value) => value === provider);
export const defaultLocalContextWindow = 16384;

export const subscriptionProviders = [
  "chatgpt-subscription",
  "claude-code",
] as const;
export type SubscriptionProvider = (typeof subscriptionProviders)[number];

export const isSubscriptionProvider = (
  provider: ProviderId,
): provider is SubscriptionProvider =>
  provider === "chatgpt-subscription" || provider === "claude-code";

export const providerAccountSchema = z.object({
  email: z.string().min(1).max(320),
  subject: z.string().min(1).max(500),
  plan: z.string().max(100).nullable(),
});
export type ProviderAccountSchema = z.infer<typeof providerAccountSchema>;

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
  models: compatibleModelsSchema.optional(),
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
  .strict()
  .superRefine((connection, context) => {
    if (connection.provider === "openai-compatible" && !connection.models)
      context.addIssue({
        code: "custom",
        path: ["models"],
        message: "Add at least one model.",
      });
    if (connection.provider !== "openai-compatible" && connection.models)
      context.addIssue({
        code: "custom",
        path: ["models"],
        message:
          "Custom model definitions require an OpenAI-compatible provider.",
      });
  });
export type SaveConnectionSchema = z.infer<typeof saveConnectionSchema>;

export const storedConnectionSchema = providerConfigSchema
  .extend({
    id: z.uuid(),
    credentialRef: z.uuid().nullable(),
    revision: z.number().int().nonnegative(),
    account: providerAccountSchema.optional(),
  })
  .strict();
export type StoredConnectionSchema = z.infer<typeof storedConnectionSchema>;

export const publicConnectionSchema = providerConfigSchema.extend({
  id: z.uuid(),
  configured: z.boolean(),
  credentialError: z.string().nullable(),
  account: providerAccountSchema.optional(),
  revision: z.number().int().nonnegative().optional(),
});
export type PublicConnectionSchema = z.infer<typeof publicConnectionSchema>;
