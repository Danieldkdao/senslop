import { z } from "zod";

export const reviewPreferencesSchema = z
  .object({
    autoAdvance: z.boolean().default(false),
  })
  .strict();
export type ReviewPreferencesSchema = z.infer<typeof reviewPreferencesSchema>;
