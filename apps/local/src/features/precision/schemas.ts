import { z } from "zod";
import {
  reviewBriefSchema,
  reviewBriefInputSchema,
  reviewInstructionsSchema,
  reviewRulesPatchSchema,
  languageCapabilitySchema,
  changeImpactSchema,
  languageSettingsSchema,
  sourceSides,
  reviewProfiles,
} from "@senslop/contracts";

export const reviewRuleScopes = ["project", "review"] as const;
export type ReviewRuleScope = (typeof reviewRuleScopes)[number];
export const symbolProvenances = ["compiler-resolved", "syntactic"] as const;
export type SymbolProvenance = (typeof symbolProvenances)[number];

export const reviewIntentStateSchema = z.object({
  briefs: z.array(reviewBriefSchema),
  instructions: reviewInstructionsSchema,
  projectDefaults: z.array(z.enum(reviewProfiles)).optional(),
  reviewDefaults: z.array(z.enum(reviewProfiles)).optional(),
  projectOverrides: reviewRulesPatchSchema,
  reviewOverrides: reviewRulesPatchSchema,
  documents: z.array(z.string()),
});
export type ReviewIntentStateSchema = z.infer<typeof reviewIntentStateSchema>;
export const reviewIntentActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save-brief"),
    version: z.number().int().nonnegative(),
    brief: reviewBriefInputSchema,
  }),
  z.object({
    action: z.literal("save-rules"),
    scope: z.enum(reviewRuleScopes),
    rules: reviewRulesPatchSchema,
  }),
  z.object({
    action: z.literal("suggest-criteria"),
    request: z.string().min(1).max(30000),
    documents: z.array(z.string()).max(20),
  }),
]);
export type ReviewIntentActionSchema = z.infer<typeof reviewIntentActionSchema>;

export const sourceSymbolSchema = z.object({
  name: z.string(),
  path: z.string(),
  start: z.number(),
  end: z.number(),
  kind: z.string(),
  type: z.string(),
  provenance: z.enum(symbolProvenances).optional(),
  references: z.array(z.object({ path: z.string(), line: z.number() })),
  callers: z.array(z.object({ path: z.string(), line: z.number() })).optional(),
});
export type SourceSymbolSchema = z.infer<typeof sourceSymbolSchema>;
export const sourceExplorerSchema = z.object({
  files: z.array(z.string()),
  symbols: z.array(sourceSymbolSchema),
  capabilities: z.record(z.string(), languageCapabilitySchema),
  impact: z.array(changeImpactSchema),
  limitations: z.array(z.string()),
  languageSettings: languageSettingsSchema,
});
export type SourceExplorerSchema = z.infer<typeof sourceExplorerSchema>;
export const sourceLocationSchema = z.object({
  path: z.string(),
  side: z.enum(sourceSides),
  start: z.number().int().positive().optional(),
  end: z.number().int().positive().optional(),
  unitId: z.string().optional(),
});
export type SourceLocationSchema = z.infer<typeof sourceLocationSchema>;
export const sourceSearchResultsSchema = z.array(
  sourceLocationSchema.extend({ code: z.string() }),
);
export type SourceSearchResultsSchema = z.infer<
  typeof sourceSearchResultsSchema
>;
