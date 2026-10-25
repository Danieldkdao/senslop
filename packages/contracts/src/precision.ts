import { z } from "zod";
import { reviewIdentitySchema } from "./workflow";

export const sourceSides = ["before", "after"] as const;
export type SourceSide = (typeof sourceSides)[number];

export const languageLevels = ["semantic", "parsing", "text"] as const;
export type LanguageLevel = (typeof languageLevels)[number];
export const languageCapabilitySchema = z.object({
  language: z.string(),
  level: z.enum(languageLevels),
  tool: z.string().nullable(),
  limitations: z.array(z.string()),
});
export type LanguageCapabilitySchema = z.infer<typeof languageCapabilitySchema>;
export const languageToolSchema = z.object({
  enabled: z.boolean().default(false),
  command: z.string().min(1).max(4096),
  args: z.array(z.string().max(2000)).max(20),
});
export type LanguageToolSchema = z.infer<typeof languageToolSchema>;
export const languageSettingsSchema = z.object({
  python: languageToolSchema.default({
    enabled: false,
    command: "pyright-langserver",
    args: ["--stdio"],
  }),
  go: languageToolSchema.default({
    enabled: false,
    command: "gopls",
    args: ["serve"],
  }),
});
export type LanguageSettingsSchema = z.infer<typeof languageSettingsSchema>;

export const relationshipProvenances = [
  "compiler-resolved",
  "syntactic",
  "inferred",
  "unresolved",
] as const;
export type RelationshipProvenance = (typeof relationshipProvenances)[number];
export const relationshipKinds = [
  "reference",
  "caller",
  "dependency",
  "dependent",
  "test",
  "definition",
] as const;
export type RelationshipKind = (typeof relationshipKinds)[number];
export const sourceRelationshipSchema = z.object({
  side: z.enum(sourceSides).optional(),
  path: z.string(),
  start: z.number().int().positive(),
  end: z.number().int().positive(),
  name: z.string(),
  kind: z.enum(relationshipKinds),
  provenance: z.enum(relationshipProvenances),
  explanation: z.string(),
});
export type SourceRelationshipSchema = z.infer<typeof sourceRelationshipSchema>;
export const changeImpactSchema = z.object({
  unitId: z.string(),
  path: z.string(),
  reasons: z.array(z.string()),
  relationships: z.array(sourceRelationshipSchema),
  limitations: z.array(z.string()),
});
export type ChangeImpactSchema = z.infer<typeof changeImpactSchema>;

import { reviewProfiles } from "./lib/constants";
export { reviewProfiles } from "./lib/constants";
export type ReviewProfile = (typeof reviewProfiles)[number];
export const reviewRuleSchema = z.object({
  id: z.string().min(1).max(200),
  text: z.string().trim().min(1).max(30000),
  paths: z.array(z.string().max(4096)).default(["**/*"]),
  enabled: z.boolean().default(true),
});
export type ReviewRuleSchema = z.infer<typeof reviewRuleSchema>;
export const reviewRulesSchema = z.object({
  profiles: z.array(z.enum(reviewProfiles)).default(["correctness"]),
  rules: z.array(reviewRuleSchema).max(500).default([]),
  instructionFiles: z.array(z.string().max(4096)).max(50).default([]),
  customProfiles: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1).max(200),
        profiles: z.array(z.enum(reviewProfiles)),
        instructions: z.string().max(30000),
      }),
    )
    .max(50)
    .default([]),
  selectedCustomProfiles: z.array(z.string()).default([]),
});
export type ReviewRulesSchema = z.infer<typeof reviewRulesSchema>;
export const reviewRulesPatchSchema = z.object({
  profiles: reviewRulesSchema.shape.profiles.unwrap().optional(),
  rules: reviewRulesSchema.shape.rules.unwrap().optional(),
  instructionFiles: reviewRulesSchema.shape.instructionFiles
    .unwrap()
    .optional(),
  customProfiles: reviewRulesSchema.shape.customProfiles.unwrap().optional(),
  selectedCustomProfiles: reviewRulesSchema.shape.selectedCustomProfiles
    .unwrap()
    .optional(),
});
export type ReviewRulesPatchSchema = z.infer<typeof reviewRulesPatchSchema>;
export const reviewInstructionsSchema = z.object({
  profiles: z.array(z.enum(reviewProfiles)),
  profileScopes: z
    .array(
      z.object({
        scope: z.string(),
        source: z.string(),
        profiles: z.array(z.enum(reviewProfiles)),
        precedence: z.number(),
      }),
    )
    .optional(),
  rules: z.array(
    reviewRuleSchema.extend({
      source: z.string(),
      scope: z.string(),
      precedence: z.number(),
    }),
  ),
  sources: z.array(
    z.object({ path: z.string(), contents: z.string(), scope: z.string() }),
  ),
  limitations: z.array(z.string()),
});
export type ReviewInstructionsSchema = z.infer<typeof reviewInstructionsSchema>;
export const reviewCriterionSchema = z.object({
  id: z.string().min(1).max(200),
  text: z.string().trim().min(1).max(3000),
  sourceQuote: z.string().max(5000).default(""),
  checkIds: z.array(z.uuid()).default([]),
});
export type ReviewCriterionSchema = z.infer<typeof reviewCriterionSchema>;
export const reviewBriefInputSchema = z.object({
  request: z.string().max(30000),
  documents: z
    .array(
      z.object({
        path: z.string().max(4096),
        contents: z.string().max(100000),
      }),
    )
    .max(20),
  links: z
    .array(
      z
        .url()
        .refine((value) =>
          ["http:", "https:"].includes(new URL(value).protocol),
        ),
    )
    .max(30),
  criteria: z.array(reviewCriterionSchema).max(100),
});
export type ReviewBriefInputSchema = z.infer<typeof reviewBriefInputSchema>;
export const reviewBriefSchema = reviewBriefInputSchema.extend({
  version: z.number().int().positive(),
  review: reviewIdentitySchema,
  createdAt: z.iso.datetime(),
  documents: z.array(
    z.object({ path: z.string(), contents: z.string(), hash: z.string() }),
  ),
});
export type ReviewBriefSchema = z.infer<typeof reviewBriefSchema>;
export const criterionStatuses = [
  "implemented",
  "verified",
  "missing",
  "unclear",
] as const;
export type CriterionStatus = (typeof criterionStatuses)[number];
export const requirementEvidenceSchema = z.object({
  path: z.string(),
  side: z.enum(sourceSides),
  start: z.number().int().positive(),
  end: z.number().int().positive(),
  code: z.string().max(20000),
});
export type RequirementEvidenceSchema = z.infer<
  typeof requirementEvidenceSchema
>;
export const requirementCoverageSchema = z.object({
  criteria: z.array(
    z.object({
      criterionId: z.string(),
      status: z.enum(criterionStatuses),
      explanation: z.string().max(5000),
      evidence: z.array(requirementEvidenceSchema).max(30),
      checkIds: z.array(z.uuid()).default([]),
      questions: z.array(z.string()).default([]),
    }),
  ),
  unexpectedChanges: z.array(
    z.object({ path: z.string(), explanation: z.string().max(3000) }),
  ),
  limitations: z.array(z.string()),
});
export type RequirementCoverageSchema = z.infer<
  typeof requirementCoverageSchema
>;
export const capturedReviewIntentSchema = z.object({
  brief: reviewBriefSchema.nullable(),
  instructions: reviewInstructionsSchema,
});
export type CapturedReviewIntentSchema = z.infer<
  typeof capturedReviewIntentSchema
>;

export const unitKinds = ["text", "binary", "metadata"] as const;
export type UnitKind = (typeof unitKinds)[number];
export const sourceRangeSchema = z.object({
  side: z.enum(sourceSides),
  start: z.number().int().positive(),
  end: z.number().int().positive(),
  code: z.string().max(1024 * 1024),
});
export type SourceRangeSchema = z.infer<typeof sourceRangeSchema>;
export const reviewUnitSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  fingerprint: z.string(),
  label: z.string(),
  kind: z.enum(unitKinds),
  ranges: z.array(sourceRangeSchema),
  reviewed: z.boolean().default(false),
  moved: z.boolean().default(false),
  needsReview: z.boolean().default(false),
});
export type ReviewUnitSchema = z.infer<typeof reviewUnitSchema>;
export const reviewFlowSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  rationale: z.string().max(3000).default(""),
  unitIds: z.array(z.string()).min(1),
});
export type ReviewFlowSchema = z.infer<typeof reviewFlowSchema>;
export const organizationSchema = z.object({
  version: z.number().int().nonnegative(),
  manual: z.boolean(),
  units: z.array(reviewUnitSchema).max(20000),
  flows: z.array(reviewFlowSchema).max(20000),
});
export type OrganizationSchema = z.infer<typeof organizationSchema>;
export const unitGroupsSchema = z.object({
  flows: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        rationale: z.string().max(3000),
        unitIds: z.array(z.string()).min(1),
      }),
    )
    .min(1),
});
export type UnitGroupsSchema = z.infer<typeof unitGroupsSchema>;
export const organizationActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reset-organization") }),
  z.object({
    action: z.literal("create-flow"),
    title: z.string().trim().min(1).max(200),
    unitIds: z.array(z.string()).min(1),
  }),
  z.object({
    action: z.literal("complete-unit"),
    unitId: z.string(),
    reviewed: z.boolean(),
  }),
  z.object({
    action: z.literal("complete-file"),
    path: z.string(),
    reviewed: z.boolean(),
  }),
  z.object({
    action: z.literal("rename-flow"),
    flowId: z.string(),
    title: z.string().trim().min(1).max(200),
  }),
  z.object({
    action: z.literal("move-flow"),
    flowId: z.string(),
    direction: z.union([z.literal(-1), z.literal(1)]),
  }),
  z.object({
    action: z.literal("move-unit"),
    unitId: z.string(),
    flowId: z.string(),
    index: z.number().int().nonnegative(),
  }),
  z.object({
    action: z.literal("split-unit"),
    unitId: z.string(),
    side: z.enum(sourceSides),
    line: z.number().int().positive(),
  }),
  z.object({
    action: z.literal("combine-units"),
    unitIds: z.array(z.string()).min(2),
  }),
  z.object({
    action: z.literal("combine-flows"),
    flowIds: z.array(z.string()).min(2),
  }),
]);
export type OrganizationActionSchema = z.infer<typeof organizationActionSchema>;
