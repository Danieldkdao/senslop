import { z } from "zod";
import { reviewIdentitySchema } from "./workflow";

export const memoryOriginKinds = ["finding", "note", "review"] as const;
export type MemoryOriginKind = (typeof memoryOriginKinds)[number];
export const memoryGuidanceSchema = z.object({
  text: z.string().trim().min(1).max(5000),
  paths: z.array(z.string().min(1).max(500)).min(1).max(50),
  assumption: z.string().max(2000).default(""),
  enabled: z.boolean().default(true),
});
export type MemoryGuidanceSchema = z.infer<typeof memoryGuidanceSchema>;
export const projectMemorySchema = memoryGuidanceSchema.extend({
  id: z.uuid(),
  version: z.number().int().positive(),
  review: reviewIdentitySchema,
  originKind: z.enum(memoryOriginKinds),
  originId: z.string().nullable(),
  createdAt: z.iso.datetime(),
  history: z.array(
    memoryGuidanceSchema.extend({ updatedAt: z.iso.datetime() }),
  ),
});
export type ProjectMemorySchema = z.infer<typeof projectMemorySchema>;
export const memoryActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    guidance: memoryGuidanceSchema,
    review: reviewIdentitySchema,
    originKind: z.enum(memoryOriginKinds),
    originId: z.string().nullable(),
  }),
  z.object({
    action: z.literal("update"),
    id: z.uuid(),
    version: z.number().int(),
    guidance: memoryGuidanceSchema,
  }),
  z.object({
    action: z.literal("remove"),
    id: z.uuid(),
    version: z.number().int(),
  }),
]);
export type MemoryActionSchema = z.infer<typeof memoryActionSchema>;
