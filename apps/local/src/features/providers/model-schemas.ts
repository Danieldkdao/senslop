import { z } from "zod";

export const modelCatalogSources = ["live", "curated", "manual"] as const;
export type ModelCatalogSource = (typeof modelCatalogSources)[number];

export const catalogModelSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe("Exact model identifier recognized by the configured provider."),
  name: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe(
      "User-facing model name; do not substitute this display label for the model ID.",
    ),
  available: z
    .boolean()
    .describe("Whether this model can currently be selected from the catalog."),
  aliases: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(200)
        .describe("Alternate provider-recognized identifier for this model."),
    )
    .max(20000)
    .optional()
    .describe("Optional alternate IDs that refer to the same catalog model."),
});
export type CatalogModelSchema = z.infer<typeof catalogModelSchema>;

export const modelCatalogSchema = z.object({
  models: z
    .array(catalogModelSchema)
    .max(20000)
    .describe(
      "Models discovered or supplied for this configured provider connection.",
    ),
  source: z
    .enum(modelCatalogSources)
    .describe(
      "Whether model entries came from live provider discovery, a curated catalog, or manual configuration.",
    ),
  manualAllowed: z
    .boolean()
    .describe(
      "Whether users may enter an exact model ID when discovery is unavailable.",
    ),
  message: z
    .string()
    .nullable()
    .describe(
      "User-facing catalog status or limitation, or null when none is needed.",
    ),
});
export type ModelCatalogSchema = z.infer<typeof modelCatalogSchema>;

export const manualModelSchema = z.object({
  connectionId: z
    .uuid("Choose a connection.")
    .describe(
      "Identifier of an existing configured provider connection; credentials and endpoint overrides are not accepted here.",
    ),
  modelId: z
    .string()
    .trim()
    .min(1, "Enter the exact model ID.")
    .max(200)
    .regex(
      /^[^\s\x00-\x1f\x7f]+$/,
      "Use a model ID without spaces or control characters.",
    )
    .describe(
      "Exact provider-recognized model ID, without spaces or control characters; do not invent an ID from a display name.",
    ),
});
export type ManualModelSchema = z.infer<typeof manualModelSchema>;

export const modelSelectionSchema = manualModelSchema.extend({
  name: catalogModelSchema.shape.name,
  manual: z
    .boolean()
    .optional()
    .describe(
      "Whether this model ID was entered manually rather than chosen from the catalog.",
    ),
});
export type ModelSelectionSchema = z.infer<typeof modelSelectionSchema>;
export type ModelSelection = ModelSelectionSchema;
