import { z } from "zod";
import {
  savedReviewSchema,
  trackedFindingSchema,
  findingDecisions,
  verificationOutcomes,
  projectPolicySchema,
  fixTaskSchema,
  checkRunSchema,
  usageRecordSchema,
  workspaceKinds,
  verificationRunSchema,
} from "@senslop/contracts";

export const workflowActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("verify-findings"),
    findingIds: z.array(z.uuid()).min(1),
  }),
  z.object({
    action: z.literal("cancel-verification"),
    verificationId: z.uuid(),
  }),
  z.object({
    action: z.literal("save-review-limits"),
    limits: projectPolicySchema.pick({
      mode: true,
      tokenBudget: true,
      timeLimitSeconds: true,
    }),
  }),
  z.object({
    action: z.literal("create-task"),
    title: z.string().trim().min(1).max(200),
    findingIds: z.array(z.uuid()).min(1),
    noteIds: z.array(z.uuid()).default([]),
    constraints: z.string().max(5000).default(""),
    checks: z.array(z.string().max(5000)).default([]),
    workspaceKind: z.enum(workspaceKinds).default("managed"),
  }),
  z.object({
    action: z.literal("claim-task"),
    taskId: z.uuid(),
    agent: z.string().trim().min(1).max(200),
  }),
  z.object({ action: z.literal("return-task"), taskId: z.uuid() }),
  z.object({ action: z.literal("cancel-task"), taskId: z.uuid() }),
  z.object({
    action: z.literal("fail-task"),
    taskId: z.uuid(),
    message: z.string().max(5000).default("Agent reported failure"),
  }),
  z.object({ action: z.literal("review-task"), taskId: z.uuid() }),
  z.object({
    action: z.literal("apply-task"),
    taskId: z.uuid(),
    paths: z.array(z.string().max(4096)).min(1),
  }),
  z.object({ action: z.literal("save-policy"), policy: projectPolicySchema }),
  z.object({
    action: z.literal("start-check"),
    compareWithBase: z.boolean().default(false),
    command: z.string().trim().min(1).max(5000),
    artifactPaths: z.array(z.string().max(4096)).max(50).default([]),
    cwd: z.string().default("."),
    findingIds: z.array(z.uuid()).default([]),
    timeoutSeconds: z.number().int().min(1).max(3600).default(600),
    reuseCheckId: z.uuid().optional(),
  }),
  z.object({ action: z.literal("cancel-check"), checkId: z.uuid() }),
  z.object({
    action: z.literal("decision"),
    findingId: z.uuid(),
    decision: z.enum(findingDecisions),
    reason: z.string().max(5000).optional(),
  }),
  z.object({
    action: z.literal("link"),
    findingId: z.uuid(),
    targetId: z.uuid().nullable(),
  }),
  z.object({
    action: z.literal("assess"),
    findingId: z.uuid(),
    outcome: z.enum(verificationOutcomes),
    explanation: z.string().max(5000).default("Manually assessed"),
    checkIds: z.array(z.uuid()).default([]),
  }),
]);
export type WorkflowActionSchema = z.infer<typeof workflowActionSchema>;
export const workflowStateSchema = z.object({
  verifications: z.array(verificationRunSchema).default([]),
  suggestedCommands: z.array(z.string()).default([]),
  findings: z.array(trackedFindingSchema),
  rounds: z.array(
    savedReviewSchema.pick({
      id: true,
      round: true,
      hash: true,
      createdAt: true,
      updatedAt: true,
    }),
  ),
  tasks: z.array(fixTaskSchema).default([]),
  checks: z.array(checkRunSchema).default([]),
  policy: projectPolicySchema,
  usage: z.array(usageRecordSchema).default([]),
});
export type WorkflowStateSchema = z.infer<typeof workflowStateSchema>;

export const reviewContextSchema = z.object({
  files: z.array(z.string()),
  selected: z.array(z.string()),
  limitations: z.array(z.string()),
  routes: z.array(
    z.object({
      role: z.string(),
      model: z.string().nullable(),
      endpoint: z.string().nullable(),
      local: z.boolean().nullable(),
    }),
  ),
  source: z
    .object({ before: z.string().nullable(), after: z.string().nullable() })
    .nullable(),
});
export type ReviewContextSchema = z.infer<typeof reviewContextSchema>;
