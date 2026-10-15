import { z } from "zod";
import { modelSelectionSchema } from "../providers/model-schemas";
export {
  modelSelectionSchema,
  type ModelSelectionSchema,
} from "../providers/model-schemas";

export const agentRoles = ["grouping", "context", "review", "explain"] as const;
export type AgentRole = (typeof agentRoles)[number];
export const groupingModes = ["always", "never", "ask"] as const;
export type GroupingMode = (typeof groupingModes)[number];
export const aiSettingsSchema = z.object({
  groupingMode: z
    .enum(groupingModes)
    .default("never")
    .describe(
      "Whether new reviews always group and summarize, never do so, or use the per-review choice.",
    ),
  separate: z
    .boolean()
    .describe(
      "Whether each task uses its own model instead of the shared model.",
    ),
  shared: modelSelectionSchema
    .nullable()
    .describe(
      "Model used for all tasks when separate is false; null means unconfigured.",
    ),
  roles: z
    .object({
      grouping: modelSelectionSchema
        .nullable()
        .describe(
          "Model that orders changed files and writes their summaries.",
        ),
      context: modelSelectionSchema
        .nullable()
        .describe(
          "Model that retrieves supporting codebase evidence for other models.",
        ),
      review: modelSelectionSchema
        .nullable()
        .describe(
          "Model that identifies correctness issues and prepares fix prompts.",
        ),
      explain: modelSelectionSchema
        .nullable()
        .describe("Model that explains selected source code and changes."),
    })
    .describe(
      "Per-task model choices used when separate is true; null roles are unconfigured.",
    ),
  prompt: z
    .string()
    .trim()
    .min(1)
    .max(30000)
    .describe(
      "User-editable instructions for organizing changes into review groups.",
    ),
});
export type AiSettingsSchema = z.infer<typeof aiSettingsSchema>;
export const groupingSchema = z.object({
  groups: z
    .array(
      z.object({
        title: z
          .string()
          .min(1)
          .max(200)
          .describe(
            "Short user-facing name for the behavior or purpose shared by this group.",
          ),
        rationale: z
          .string()
          .max(3000)
          .describe(
            "Why these files belong together and why this group appears at this point in the review order.",
          ),
        files: z
          .array(
            z.object({
              path: z
                .string()
                .min(1)
                .max(4096)
                .describe(
                  "Exact repository-relative path from the selected changed files; never invent a path.",
                ),
              summary: z
                .string()
                .min(1)
                .max(3000)
                .describe(
                  "Concise explanation of what changed in this file and how it supports the group's behavior; describe only metadata for binary files.",
                ),
              related: z
                .array(
                  z
                    .string()
                    .max(4096)
                    .describe(
                      "Exact path of another selected changed file; exclude this file's own path.",
                    ),
                )
                .max(30)
                .describe(
                  "Other changed files that help explain this file; use an empty array when none are relevant.",
                ),
            }),
          )
          .min(1)
          .max(2000)
          .describe(
            "Changed files in prerequisite-first reading order, with tests last; each file belongs to exactly one group.",
          ),
      }),
    )
    .min(1)
    .max(2000)
    .describe(
      "Behavior-based review groups covering every selected changed file exactly once; order prerequisites before consumers and keep dependency cycles together.",
    ),
});
export type GroupingSchema = z.infer<typeof groupingSchema>;

export const createGroupingBatchSchema = (paths: string[]) => {
  const group = groupingSchema.shape.groups.element;
  const file = group.shape.files.element;
  return groupingSchema.extend({
    groups: z
      .array(
        group.extend({
          title: group.shape.title.max(120),
          rationale: group.shape.rationale.max(400),
          files: z
            .array(
              file.extend({
                path: z
                  .literal(paths)
                  .describe(
                    "Exact path of a file in this batch. Other snapshot paths are context only and must not be included.",
                  ),
                summary: file.shape.summary.max(500),
                related: file.shape.related.max(5),
              }),
            )
            .min(1)
            .max(paths.length)
            .describe(group.shape.files.description!),
        }),
      )
      .min(1)
      .max(paths.length)
      .describe(
        "Cover only the supplied batch files exactly once, prerequisites first and tests last. Other batches are handled separately.",
      ),
  });
};
export type CreateGroupingBatchSchema = z.infer<
  ReturnType<typeof createGroupingBatchSchema>
>;

export const groupOutlineSchema = z.object({
  groups: z
    .array(
      groupingSchema.shape.groups.element.extend({
        title: groupingSchema.shape.groups.element.shape.title.max(120),
        rationale: groupingSchema.shape.groups.element.shape.rationale.max(400),
        files: z
          .array(
            z
              .number()
              .int()
              .min(0)
              .max(1999)
              .describe(
                "Zero-based file ID from the prepared file catalog, not a path. Include every prepared ID exactly once in prerequisite-first order.",
              ),
          )
          .min(1)
          .max(2000)
          .describe(
            "Prepared file IDs in this group; paths and summaries are retained separately and must not be rewritten.",
          ),
      }),
    )
    .min(1)
    .max(32)
    .describe(
      "Final behavior-based groups spanning all analysis batches, prerequisites first and tests last.",
    ),
});
export type GroupOutlineSchema = z.infer<typeof groupOutlineSchema>;
export const findingSeverities = [
  "critical",
  "high",
  "medium",
  "low",
  "informational",
] as const;
export type FindingSeverity = (typeof findingSeverities)[number];
export const evidenceSides = ["before", "after"] as const;
export type EvidenceSide = (typeof evidenceSides)[number];
export const messageRoles = ["user", "assistant"] as const;
export type MessageRole = (typeof messageRoles)[number];
export const findingSchema = z.object({
  severity: z
    .enum(findingSeverities)
    .describe(
      "Impact supported by evidence: critical for severe security or data loss, high for major failures, medium for limited cases, low for minor defects, informational for nonblocking observations.",
    ),
  title: z
    .string()
    .min(1)
    .max(300)
    .describe("Short user-facing description of the specific issue."),
  problem: z
    .string()
    .min(1)
    .max(5000)
    .describe(
      "Concrete trigger, incorrect behavior, and consequence caused by the selected changes; do not report speculative or unrelated pre-existing issues.",
    ),
  rationale: z
    .string()
    .max(5000)
    .describe(
      "Evidence from source, callers, types, dependencies, or tests that supports this finding; distinguish compiler facts from inference.",
    ),
  path: z
    .string()
    .min(1)
    .max(4096)
    .describe(
      "Exact repository-relative path of a selected changed text file containing the evidence.",
    ),
  side: z
    .enum(evidenceSides)
    .describe(
      "Frozen source version containing the evidence: before is the original file, after is the changed file.",
    ),
  start: z
    .number()
    .int()
    .positive()
    .describe(
      "Inclusive 1-based starting line in the chosen source side; the range must overlap a selected diff hunk.",
    ),
  end: z
    .number()
    .int()
    .positive()
    .describe(
      "Inclusive 1-based ending line on the same source side; at least start and at most start plus 100.",
    ),
  code: z
    .string()
    .min(1)
    .max(10000)
    .describe(
      "Exact contiguous source text from start through end, joined with newlines; preserve whitespace and do not paraphrase or add line numbers.",
    ),
  fixPrompt: z
    .string()
    .min(1)
    .max(10000)
    .describe(
      "Copyable instructions for an AI to verify the issue against current source, make a focused fix, and run relevant tests; this does not execute changes.",
    ),
});
export type FindingSchema = z.infer<typeof findingSchema>;
export const correctnessSchema = z.object({
  fixAllPrompt: z
    .string()
    .max(20000)
    .default("")
    .describe(
      "Combined fix instructions for all verified findings, including current-source checks and relevant tests; state that no fixes are needed when there are no findings.",
    ),
  findings: z
    .array(
      findingSchema.extend({
        // Saved prompts include the verified source excerpt and location.
        fixPrompt: z
          .string()
          .min(1)
          .max(30000)
          .describe(findingSchema.shape.fixPrompt.description!),
      }),
    )
    .describe(
      "Evidence-backed issues in the selected changes, ordered from highest to lowest severity; return an empty array when none are established.",
    ),
  limitations: z
    .array(
      z
        .string()
        .max(3000)
        .describe(
          "A concrete gap in the available evidence, analysis coverage, or verification.",
        ),
    )
    .describe(
      "Missing dependencies, uncaptured context, unsupported diagnostics, or other analysis limits; do not imply these are proven bugs.",
    ),
});
export type CorrectnessSchema = z.infer<typeof correctnessSchema>;
export const jobKinds = ["grouping", "review"] as const;
export type JobKind = (typeof jobKinds)[number];
export const jobStatuses = [
  "queued",
  "running",
  "completed",
  "failed",
  "canceled",
] as const;
export type JobStatus = (typeof jobStatuses)[number];
export const jobSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe("User-assigned review name; absent in older runs."),
  id: z
    .uuid()
    .describe("Application-assigned identifier of this local AI job."),
  snapshotId: z
    .uuid()
    .describe(
      "Identifier of the immutable review snapshot analyzed by the job.",
    ),
  hash: z
    .string()
    .describe("Captured snapshot content hash used to reject stale results."),
  snapshotRound: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Re-sync round captured at job creation; absent in older saved runs.",
    ),
  kind: z
    .enum(jobKinds)
    .describe(
      "Task performed by the job: grouping changed files or reviewing their correctness.",
    ),
  generation: z
    .number()
    .int()
    .describe("Application-assigned run sequence for this task and snapshot."),
  settings: aiSettingsSchema.describe(
    "Model assignments and grouping instructions captured when the job was created.",
  ),
  status: z
    .enum(jobStatuses)
    .describe(
      "Persisted job lifecycle state; completed means the validated result was published.",
    ),
  progress: z
    .string()
    .describe("User-facing description of the job's current stage."),
  error: z
    .string()
    .nullable()
    .describe("Sanitized failure details, or null when no error is recorded."),
  createdAt: z.iso
    .datetime()
    .describe("ISO timestamp when the job was created."),
  updatedAt: z.iso
    .datetime()
    .describe("ISO timestamp of the most recent job update."),
  runId: z
    .string()
    .nullable()
    .describe("Local Inngest run identifier, or null before registration."),
  dispatched: z
    .boolean()
    .describe("Whether the job event has been dispatched to the local worker."),
  result: z
    .union([groupingSchema, correctnessSchema])
    .nullable()
    .describe(
      "Validated output matching the job kind, or null before a result is available.",
    ),
});
export type JobSchema = z.infer<typeof jobSchema>;
