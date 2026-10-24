import { z } from "zod";

export const compatibleModelTokenBounds = {
  maxCompletionTokens: { min: 64, max: 2000000 },
  maxOutputTokens: { min: 64, max: 2000000 },
  contextWindow: { min: 256, max: 2000000 },
} as const;

export const compatibleModelSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1, "Enter the model name used by the API.")
      .max(200)
      .regex(
        /^[^\s\x00-\x1f\x7f]+$/,
        "Use a model name without spaces or control characters.",
      ),
    maxCompletionTokens: z
      .number()
      .int()
      .min(compatibleModelTokenBounds.maxCompletionTokens.min)
      .max(compatibleModelTokenBounds.maxCompletionTokens.max),
    maxOutputTokens: z
      .number()
      .int()
      .min(compatibleModelTokenBounds.maxOutputTokens.min)
      .max(compatibleModelTokenBounds.maxOutputTokens.max),
    contextWindow: z
      .number()
      .int()
      .min(compatibleModelTokenBounds.contextWindow.min)
      .max(compatibleModelTokenBounds.contextWindow.max),
    supportsTools: z.boolean(),
    supportsImages: z.boolean(),
    supportsParallelToolCalls: z.boolean(),
    supportsPromptCacheKey: z.boolean(),
    supportsChatCompletions: z.boolean(),
    usesMaxTokens: z.boolean(),
    supportsThinking: z.boolean(),
  })
  .strict()
  .superRefine((model, context) => {
    for (const field of ["maxCompletionTokens", "maxOutputTokens"] as const)
      if (model[field] > model.contextWindow)
        context.addIssue({
          code: "custom",
          path: [field],
          message:
            "The output allowance cannot exceed the model context window.",
        });
    if (model.supportsParallelToolCalls && !model.supportsTools)
      context.addIssue({
        code: "custom",
        path: ["supportsParallelToolCalls"],
        message: "Enable tool support before enabling parallel tool calls.",
      });
    if (model.usesMaxTokens && !model.supportsChatCompletions)
      context.addIssue({
        code: "custom",
        path: ["usesMaxTokens"],
        message: "Legacy max_tokens applies only to chat completions.",
      });
  });
export type CompatibleModelSchema = z.infer<typeof compatibleModelSchema>;

export const compatibleModelsSchema = z
  .array(compatibleModelSchema)
  .min(1, "Add at least one model.")
  .max(100)
  .superRefine((models, context) => {
    const ids = new Set<string>();
    models.forEach((model, index) => {
      if (ids.has(model.id))
        context.addIssue({
          code: "custom",
          path: [index, "id"],
          message: "Each model name must be unique within this provider.",
        });
      ids.add(model.id);
    });
  });
export type CompatibleModelsSchema = z.infer<typeof compatibleModelsSchema>;
