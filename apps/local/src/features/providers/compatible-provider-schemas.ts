import { z } from "zod";
import {
  compatibleModelsSchema,
  saveConnectionSchema,
} from "@senslop/contracts";

export const compatibleProviderFormSchema = saveConnectionSchema.safeExtend({
  provider: z.literal("openai-compatible"),
  models: compatibleModelsSchema,
});
export type CompatibleProviderFormSchema = z.infer<
  typeof compatibleProviderFormSchema
>;
