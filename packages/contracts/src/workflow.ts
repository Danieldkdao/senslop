import { z } from "zod";

export const findingDecisions = [
  "open",
  "accepted",
  "dismissed",
  "resolved",
] as const;
export type FindingDecision = (typeof findingDecisions)[number];
export const verificationOutcomes = [
  "present",
  "apparently-fixed",
  "not-applicable",
  "unverified",
] as const;
export type VerificationOutcome = (typeof verificationOutcomes)[number];
export const findingCategories = [
  "correctness",
  "security",
  "performance",
  "reliability",
  "uncategorized",
] as const;
export type FindingCategory = (typeof findingCategories)[number];
export const workflowSeverities = [
  "critical",
  "high",
  "medium",
  "low",
  "informational",
] as const;
export type WorkflowSeverity = (typeof workflowSeverities)[number];
export const findingEvidenceSides = ["before", "after"] as const;
export type FindingEvidenceSide = (typeof findingEvidenceSides)[number];
export const reviewIdentitySchema = z.object({
  id: z.uuid(),
  hash: z.string().length(64),
  round: z.number().int().positive(),
});
export type ReviewIdentitySchema = z.infer<typeof reviewIdentitySchema>;
export const findingEvidenceSchema = z.object({
  title: z.string().min(1),
  severity: z.enum(workflowSeverities),
  problem: z.string(),
  path: z.string(),
  side: z.enum(findingEvidenceSides),
  start: z.number().int().positive(),
  end: z.number().int().positive(),
  code: z.string(),
  fixPrompt: z.string(),
  category: z.enum(findingCategories).default("uncategorized"),
});
export type FindingEvidenceSchema = z.infer<typeof findingEvidenceSchema>;
export const findingObservationSchema = z.object({
  id: z.uuid(),
  jobId: z.uuid(),
  review: reviewIdentitySchema,
  evidence: findingEvidenceSchema,
  createdAt: z.iso.datetime(),
});
export type FindingObservationSchema = z.infer<typeof findingObservationSchema>;
export const findingEventKinds = [
  "decision",
  "assessment",
  "duplicate",
  "recurrence",
] as const;
export type FindingEventKind = (typeof findingEventKinds)[number];
export const findingEventSchema = z.object({
  id: z.uuid(),
  kind: z.enum(findingEventKinds),
  review: reviewIdentitySchema,
  label: z.string(),
  reason: z.string().max(5000).optional(),
  createdAt: z.iso.datetime(),
});
export type FindingEventSchema = z.infer<typeof findingEventSchema>;
export const trackedFindingSchema = z.object({
  id: z.uuid(),
  reviewId: z.uuid(),
  decision: z.enum(findingDecisions),
  observations: z.array(findingObservationSchema),
  history: z.array(findingEventSchema),
  possibleMatches: z.array(z.uuid()).default([]),
  duplicateOf: z.uuid().nullable().default(null),
  assessment: z
    .object({
      review: reviewIdentitySchema,
      outcome: z.enum(verificationOutcomes),
      explanation: z.string(),
      checkIds: z.array(z.uuid()),
      createdAt: z.iso.datetime(),
    })
    .nullable()
    .default(null),
});
export type TrackedFindingSchema = z.infer<typeof trackedFindingSchema>;

export const fixTaskStatuses = [
  "ready",
  "in-progress",
  "returned",
  "reviewed",
  "failed",
  "canceled",
] as const;
export type FixTaskStatus = (typeof fixTaskStatuses)[number];
export const workspaceKinds = ["managed", "current"] as const;
export type WorkspaceKind = (typeof workspaceKinds)[number];
export const taskChangeSchema = z.object({
  path: z.string(),
  before: z.string().nullable(),
  after: z.string().nullable(),
  outsideRequestedFiles: z.boolean(),
});
export type TaskChangeSchema = z.infer<typeof taskChangeSchema>;
export const fixTaskSchema = z.object({
  id: z.uuid(),
  review: reviewIdentitySchema,
  title: z.string().min(1).max(200),
  findingIds: z.array(z.uuid()).min(1),
  noteIds: z.array(z.uuid()),
  constraints: z.string().max(5000),
  checks: z.array(z.string()),
  status: z.enum(fixTaskStatuses),
  agent: z.string().nullable(),
  workspaceKind: z.enum(workspaceKinds),
  directory: z.string().nullable(),
  manifestId: z.uuid().nullable(),
  changes: z.array(taskChangeSchema),
  activity: z.array(
    z.object({ label: z.string(), createdAt: z.iso.datetime() }),
  ),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type FixTaskSchema = z.infer<typeof fixTaskSchema>;

export const checkStatuses = [
  "queued",
  "running",
  "passed",
  "failed",
  "blocked",
  "canceled",
  "timed-out",
  "interrupted",
] as const;
export type CheckStatus = (typeof checkStatuses)[number];
export const executionSourceSides = ["changed", "base"] as const;
export type ExecutionSourceSide = (typeof executionSourceSides)[number];
export const checkArtifactSchema = z.object({
  path: z.string(),
  hash: z.string().nullable(),
  size: z.number().nonnegative().nullable(),
  error: z.string().nullable(),
});
export type CheckArtifactSchema = z.infer<typeof checkArtifactSchema>;
export const checkRunSchema = z.object({
  artifactPaths: z.array(z.string()).default([]),
  artifacts: z.array(checkArtifactSchema).default([]),
  sourceSide: z.enum(executionSourceSides).default("changed"),
  ownerPid: z.number().int().positive().nullable().default(null),
  id: z.uuid(),
  review: reviewIdentitySchema,
  findingIds: z.array(z.uuid()),
  command: z.string(),
  cwd: z.string(),
  status: z.enum(checkStatuses),
  manifestId: z.uuid().nullable(),
  environment: z.record(z.string(), z.string()),
  dependencyHash: z.string().nullable(),
  output: z.string(),
  logExpired: z.boolean().default(false),
  exitCode: z.number().nullable(),
  durationMs: z.number().nullable(),
  sourceModified: z.boolean(),
  error: z.string().nullable(),
  baselineId: z.uuid().nullable(),
  timeoutSeconds: z.number().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type CheckRunSchema = z.infer<typeof checkRunSchema>;

export const inferencePolicies = ["configured", "local-only"] as const;
export type InferencePolicy = (typeof inferencePolicies)[number];
export const analysisModes = ["quick", "thorough"] as const;
export type AnalysisMode = (typeof analysisModes)[number];
export const projectPolicySchema = z.object({
  include: z.array(z.string().max(4096)).default([]),
  exclude: z.array(z.string().max(4096)).default([]),
  inference: z.enum(inferencePolicies).default("configured"),
  mode: z.enum(analysisModes).default("thorough"),
  tokenBudget: z.number().int().positive().nullable().default(null),
  timeLimitSeconds: z.number().positive().nullable().default(null),
  checkTimeoutSeconds: z.number().positive().default(600),
  historyRetentionDays: z.number().int().positive().nullable().default(null),
  logRetentionDays: z.number().int().positive().nullable().default(30),
  workspaceRetentionDays: z.number().int().positive().default(7),
});
export type ProjectPolicySchema = z.infer<typeof projectPolicySchema>;
export const usageRecordSchema = z.object({
  id: z.uuid(),
  reviewId: z.uuid(),
  round: z.number().int().positive(),
  requestId: z.string(),
  task: z.string(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  inputTokens: z.number().nonnegative().nullable(),
  outputTokens: z.number().nonnegative().nullable(),
  durationMs: z.number().nonnegative(),
  estimatedCost: z.number().nonnegative().nullable(),
  createdAt: z.iso.datetime(),
  reservedTokens: z.number().nonnegative().default(0),
  completed: z.boolean().default(false),
});
export type UsageRecordSchema = z.infer<typeof usageRecordSchema>;

export const executionManifestSchema = z.object({
  removedAt: z.iso.datetime().nullable().default(null),
  sourceSide: z.enum(executionSourceSides).default("changed"),
  id: z.uuid(),
  review: reviewIdentitySchema,
  directory: z.string(),
  base: z.string(),
  policyHash: z.string(),
  files: z.array(
    z.object({ path: z.string(), hash: z.string(), mode: z.number().int() }),
  ),
  dependencyHash: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type ExecutionManifestSchema = z.infer<typeof executionManifestSchema>;

export const workspaceSessionSchema = z
  .object({
    version: z.literal(1),
    repository: z.string().min(1),
    origin: z.url().refine((value) => {
      const url = new URL(value);
      return (
        url.protocol === "http:" &&
        url.hostname === "127.0.0.1" &&
        !!url.port &&
        value === url.origin
      );
    }),
    token: z.string().regex(/^[a-f0-9]{64}$/),
    pid: z.number().int().positive(),
  })
  .strict();
export type WorkspaceSessionSchema = z.infer<typeof workspaceSessionSchema>;

export const workflowJobStatuses = [
  "queued",
  "running",
  "completed",
  "failed",
  "canceled",
] as const;
export type WorkflowJobStatus = (typeof workflowJobStatuses)[number];
export const verificationAssessmentSchema = z.object({
  findingId: z.uuid(),
  outcome: z.enum(verificationOutcomes),
  explanation: z.string().min(1).max(5000),
});
export type VerificationAssessmentSchema = z.infer<
  typeof verificationAssessmentSchema
>;
export const verificationRunSchema = z.object({
  id: z.uuid(),
  review: reviewIdentitySchema,
  findingIds: z.array(z.uuid()).min(1),
  status: z.enum(workflowJobStatuses),
  error: z.string().nullable(),
  assessments: z.array(verificationAssessmentSchema),
  ownerPid: z.number().int().positive().nullable().default(null),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type VerificationRunSchema = z.infer<typeof verificationRunSchema>;
