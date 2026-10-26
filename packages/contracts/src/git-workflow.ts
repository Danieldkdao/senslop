import { z } from "zod";
import { workflowSeverities } from "./workflow";

export const gitOperationStatuses = [
  "running",
  "completed",
  "failed",
  "interrupted",
] as const;
export type GitOperationStatus = (typeof gitOperationStatuses)[number];
export const gitOperationSchema = z.object({
  id: z.uuid(),
  action: z.string(),
  status: z.enum(gitOperationStatuses),
  output: z.string(),
  createdAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  commit: z.string().nullable(),
  ownerPid: z.number().optional(),
  coverage: z
    .array(
      z.object({
        reviewId: z.string(),
        hash: z.string(),
        round: z.number(),
        paths: z.array(z.string()),
      }),
    )
    .default([]),
});
export type GitOperationSchema = z.infer<typeof gitOperationSchema>;
export const gitFileSchema = z.object({
  path: z.string(),
  oldPath: z.string().nullable(),
  index: z.string(),
  working: z.string(),
  excluded: z.boolean(),
  stagedAdded: z.number().default(0),
  stagedDeleted: z.number().default(0),
  added: z.number().default(0),
  deleted: z.number().default(0),
});
export type GitFileSchema = z.infer<typeof gitFileSchema>;
export const gitStateSchema = z.object({
  identity: z.string(),
  head: z.string().nullable(),
  branch: z.string(),
  upstream: z.string().nullable(),
  ahead: z.number(),
  behind: z.number(),
  remotes: z.array(z.object({ name: z.string(), url: z.string() })),
  files: z.array(gitFileSchema),
  conflicts: z.array(z.string()),
  operations: z.array(gitOperationSchema),
  fetchedAt: z.string().nullable(),
  mergeInProgress: z.boolean().default(false),
});
export type GitStateSchema = z.infer<typeof gitStateSchema>;
export const gitActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("stage"),
    path: z.string(),
    expected: z.string(),
    hunk: z.number().int().nonnegative().optional(),
  }),
  z.object({
    action: z.literal("unstage"),
    path: z.string(),
    expected: z.string(),
    hunk: z.number().int().nonnegative().optional(),
  }),
  z.object({
    action: z.literal("commit"),
    subject: z.string().trim().min(1).max(200),
    body: z.string().max(10000).default(""),
    expected: z.string(),
  }),
  z.object({
    action: z.literal("fetch"),
    remote: z.string(),
    expected: z.string(),
  }),
  z.object({
    action: z.literal("pull"),
    remote: z.string(),
    branch: z.string(),
    expected: z.string(),
  }),
  z.object({ action: z.literal("abort-merge"), expected: z.string() }),
  z.object({
    action: z.literal("push"),
    remote: z.string(),
    branch: z.string(),
    expected: z.string(),
    expectedOutgoing: z.string().optional(),
    overrideReason: z.string().trim().min(1).max(2000).optional(),
  }),
  z.object({ action: z.literal("stage-all"), expected: z.string() }),
  z.object({ action: z.literal("unstage-all"), expected: z.string() }),
]);
export type GitActionSchema = z.infer<typeof gitActionSchema>;
export const checkpointPolicySchema = z.object({
  enabled: z.boolean().default(false),
  requireReviewed: z.boolean().default(true),
  requireHistory: z.boolean().default(true),
  blockingSeverity: z.enum(workflowSeverities).default("high"),
  requiredChecks: z.array(z.string().trim().min(1).max(5000)).default([]),
});
export type CheckpointPolicySchema = z.infer<typeof checkpointPolicySchema>;
export const outgoingRefSchema = z.object({
  localRef: z.string(),
  localOid: z.string().regex(/^[a-f0-9]{40,64}$/),
  remoteRef: z.string(),
  remoteOid: z.string().regex(/^[a-f0-9]{40,64}$/),
});
export type OutgoingRefSchema = z.infer<typeof outgoingRefSchema>;
export const coverageIssueKinds = [
  "unreviewed",
  "finding",
  "check",
  "unknown",
] as const;
export type CoverageIssueKind = (typeof coverageIssueKinds)[number];
export const checkpointResultSchema = z.object({
  identity: z.string(),
  remote: z.string(),
  refs: z.array(outgoingRefSchema),
  enabled: z.boolean(),
  ready: z.boolean(),
  commits: z.array(z.object({ oid: z.string(), subject: z.string() })),
  issues: z.array(
    z.object({
      kind: z.enum(coverageIssueKinds),
      message: z.string(),
      path: z.string().optional(),
      reviewId: z.string().optional(),
      commit: z.string().optional(),
    }),
  ),
  reviewed: z.number(),
  total: z.number(),
});
export type CheckpointResultSchema = z.infer<typeof checkpointResultSchema>;
