import { unitGroupsSchema } from "@senslop/contracts";
import { z } from "zod";
import { findingSchema } from "../agents/schemas";

export const evaluationModes = ["deterministic", "live"] as const;
export type EvaluationMode = (typeof evaluationModes)[number];
export const evaluationCaseResultSchema = z.object({
  caseId: z.string(),
  scenario: z.string(),
  provenance: z.string(),
  expectedIssues: z.number(),
  truePositives: z.number(),
  falsePositives: z.number(),
  duplicates: z.number(),
  missed: z.number(),
  precision: z.number().nullable(),
  recall: z.number().nullable(),
  evidenceAccuracy: z.number().nullable(),
  durationMs: z.number().nullable(),
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  estimatedCost: z.number().nullable(),
  contractPassed: z.boolean(),
  contractChecks: z.array(z.string()).optional(),
  groupingCoverage: z.number().nullable(),
  groupingUseful: z.boolean().nullable().optional(),
  groupingIssues: z.array(z.string()).optional(),
  unitGroups: unitGroupsSchema.shape.flows.optional(),
  findings: z.array(findingSchema),
  expected: z.array(z.string()),
  limitations: z.array(z.string()),
});
export type EvaluationCaseResultSchema = z.infer<
  typeof evaluationCaseResultSchema
>;
export const evaluationRunSchema = z.object({
  id: z.uuid(),
  corpusVersion: z.string(),
  mode: z.enum(evaluationModes),
  model: z.string().nullable(),
  instructions: z.string().optional(),
  instructionHash: z.string().optional(),
  createdAt: z.iso.datetime(),
  durationMs: z.number(),
  cases: z.array(evaluationCaseResultSchema),
  totals: z.object({
    truePositives: z.number(),
    falsePositives: z.number(),
    duplicates: z.number(),
    missed: z.number(),
    evidenceAccuracy: z.number().nullable(),
    inputTokens: z.number().nullable(),
    outputTokens: z.number().nullable(),
    estimatedCost: z.number().nullable(),
  }),
  limitations: z.array(z.string()),
});
export type EvaluationRunSchema = z.infer<typeof evaluationRunSchema>;
