import { z } from "zod";

export const modelCatalogSources = ["live", "curated", "manual"] as const;
export type ModelCatalogSource = (typeof modelCatalogSources)[number];

export const catalogModelSchema = z.object({
  id: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  available: z.boolean(),
  aliases: z.array(z.string().trim().min(1).max(200)).max(20000).optional(),
});
export type CatalogModelSchema = z.infer<typeof catalogModelSchema>;

export const modelCatalogSchema = z.object({
  models: z.array(catalogModelSchema).max(20000),
  source: z.enum(modelCatalogSources),
  manualAllowed: z.boolean(),
  message: z.string().nullable(),
});
export type ModelCatalogSchema = z.infer<typeof modelCatalogSchema>;

export const manualModelSchema = z.object({
  connectionId: z.uuid("Choose a connection."),
  modelId: z
    .string()
    .trim()
    .min(1, "Enter the exact model ID.")
    .max(200)
    .regex(
      /^[^\s\x00-\x1f\x7f]+$/,
      "Use a model ID without spaces or control characters.",
    ),
});
export type ManualModelSchema = z.infer<typeof manualModelSchema>;

export type ModelSelection = {
  connectionId: string;
  modelId: string;
  name: string;
  manual?: boolean;
};
