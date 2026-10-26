import { z } from "zod";
import { reviewIdentitySchema } from "./workflow";

export const reportItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  detail: z.string(),
  path: z.string().optional(),
  code: z.string().optional(),
  reviewId: z.string().optional(),
  evidenceReview: reviewIdentitySchema.optional(),
  location: z
    .object({ side: z.string(), start: z.number(), end: z.number() })
    .optional(),
});
export type ReportItemSchema = z.infer<typeof reportItemSchema>;
export const reviewReportSchema = z.object({
  id: z.uuid(),
  review: reviewIdentitySchema,
  title: z.string(),
  createdAt: z.iso.datetime(),
  source: z.object({
    kind: z.string(),
    base: z.string(),
    head: z.string().nullable(),
  }),
  includeSource: z.boolean(),
  reviewed: z.number(),
  total: z.number(),
  sections: z.array(
    z.object({ title: z.string(), items: z.array(reportItemSchema) }),
  ),
  provenance: z.record(z.string(), z.unknown()),
  remainingWork: z.string(),
});
export type ReviewReportSchema = z.infer<typeof reviewReportSchema>;
