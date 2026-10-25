import { z } from "zod";
import {
  analysisModes,
  workflowSeverities,
  findingCategories,
} from "@senslop/contracts";
import { modelSelectionSchema } from "../providers/model-schemas";
import { aiCapacitySchema } from "../ai-capacity/schemas";
export {
  modelSelectionSchema,
  type ModelSelectionSchema,
} from "../providers/model-schemas";

export const agentRoles = ["grouping", "context", "review", "explain"] as const;
export type AgentRole = (typeof agentRoles)[number];
export const groupingModes = ["always", "never", "ask"] as const;
export type GroupingMode = (typeof groupingModes)[number];
export const aiSettingsSchema = z.object({
  machineConcurrency: z.number().int().min(1).max(64).optional(),
  capacity: aiCapacitySchema.default({}),
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

export const aiSettingsPatchSchema = aiSettingsSchema
  .partial()
  .extend({
    capacity: aiCapacitySchema.optional(),
    groupingMode: z.enum(groupingModes).optional(),
    roles: aiSettingsSchema.shape.roles.partial().optional(),
  })
  .strict();
export type AiSettingsPatchSchema = z.infer<typeof aiSettingsPatchSchema>;
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
export const findingSeverities = workflowSeverities;
export type FindingSeverity = (typeof findingSeverities)[number];
export const evidenceSides = ["before", "after"] as const;
export type EvidenceSide = (typeof evidenceSides)[number];
export const messageRoles = ["user", "assistant"] as const;
export type MessageRole = (typeof messageRoles)[number];
export const findingSchema = z.object({
  category: z
    .enum(findingCategories)
    .optional()
    .describe(
      "Issue category; use uncategorized when no narrower category is justified.",
    ),
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
      "One concise Markdown paragraph, ideally 40–80 words: explain the concrete trigger, incorrect behavior and impact, then end with one short sentence suggesting a targeted fix. Include essential supporting evidence here. No headings, lists or paragraph breaks. Use code spans for identifiers; avoid speculative or unrelated pre-existing bugs.",
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
      "Short, targeted Markdown fix guidance: 1–2 sentences describing the smallest appropriate change and relevant verification. Do not repeat the problem, path, source excerpt or surrounding review. The application adds location, issue context and an instruction to determine whether the issue is valid before fixing it.",
    ),
});
export type FindingSchema = z.infer<typeof findingSchema>;
export const correctnessSchema = z.object({
  summary: z
    .string()
    .trim()
    .min(1)
    .max(400)
    .optional()
    .catch(undefined)
    .describe(
      "Optional single short sentence summarizing what should be fixed before merging. Omit when no issues exist. A missing summary must not invalidate findings.",
    ),
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
        // Saved prompts include Markdown context and the verified location.
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
export const jobPriorities = ["normal", "high"] as const;
export type JobPriority = (typeof jobPriorities)[number];
export const jobSchema = z.object({
  analysisMode: z.enum(analysisModes).default("thorough"),
  priority: z.enum(jobPriorities).default("normal"),
  retryOf: z.uuid().nullable().default(null),
  dispatchKey: z.string().nullable().default(null),
  dispatchGeneration: z.number().int().nonnegative().default(0),
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
  retryAt: z.iso
    .datetime()
    .nullable()
    .default(null)
    .describe(
      "Earliest automatic retry time, or null when no retry is scheduled.",
    ),
  fallbackAt: z.iso
    .datetime()
    .nullable()
    .default(null)
    .describe(
      "Time to open the original file review after terminal grouping failure.",
    ),
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
export const messageStatuses = [
  "complete",
  "streaming",
  "interrupted",
] as const;
export type MessageStatus = (typeof messageStatuses)[number];
export const conversationSchema = z.object({
  sourcePolicyHash: z.string().nullable().default(null),
  id: z
    .uuid()
    .describe("Application-assigned identifier of the saved conversation."),
  snapshotId: z
    .uuid()
    .describe("Immutable review snapshot discussed in this conversation."),
  title: z
    .string()
    .min(1)
    .max(200)
    .describe("User-facing conversation name shown in history."),
  updatedAt: z.iso
    .datetime()
    .describe("ISO timestamp of the most recent conversation update."),
  model: modelSelectionSchema
    .nullable()
    .describe("Most recently selected chat model, or null before selection."),
  messages: z
    .array(
      z.object({
        id: z
          .string()
          .min(1)
          .max(200)
          .optional()
          .describe(
            "Stable SDK message identifier used for retries and stale-response protection; absent in legacy messages.",
          ),
        parts: z
          .array(
            z
              .unknown()
              .describe(
                "An SDK UI message part, such as text, a step boundary, or a tool call/result.",
              ),
          )
          .max(1000)
          .optional()
          .describe(
            "Structured SDK message content preserved for rendering and future model turns; absent in legacy messages.",
          ),
        role: z
          .enum(messageRoles)
          .describe(
            "Message author: user for a submitted question, assistant for a generated answer.",
          ),
        content: z
          .string()
          .max(100000)
          .describe(
            "Plain text message content, including partial output for interrupted answers.",
          ),
        status: z
          .enum(messageStatuses)
          .describe(
            "Whether the message is complete, currently streaming, or interrupted.",
          ),
        model: modelSelectionSchema
          .nullable()
          .describe(
            "Model selected for this turn, or null when unavailable in saved history.",
          ),
        updatedAt: z.iso
          .datetime()
          .describe("ISO timestamp of the most recent message update."),
        createdAt: z.iso
          .datetime()
          .optional()
          .describe("Original message send time; absent in legacy history."),
        thinkingDurationMs: z
          .number()
          .finite()
          .nonnegative()
          .optional()
          .describe(
            "Elapsed thinking and tool time before the final answer, in milliseconds.",
          ),
        toolTrace: z
          .array(
            z
              .unknown()
              .describe("A legacy record of a repository tool call or result."),
          )
          .max(50)
          .default([])
          .describe(
            "Legacy tool records retained for backward compatibility; current responses use structured parts.",
          ),
      }),
    )
    .max(100)
    .describe(
      "Chronological user and assistant messages belonging to this snapshot conversation.",
    ),
});
export type ConversationSchema = z.infer<typeof conversationSchema>;
export const agentStateSchema = z.object({
  jobs: z
    .array(jobSchema)
    .describe("Saved grouping and review jobs for the selected snapshot."),
  conversations: z
    .array(conversationSchema.omit({ messages: true }))
    .describe("Saved conversation summaries without message bodies."),
});
export type AgentStateSchema = z.infer<typeof agentStateSchema>;
export const agentActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("rename-review"),
    id: z.uuid(),
    title: z.string().trim().min(1).max(200),
  }),
  z.object({ action: z.literal("delete-review"), id: z.uuid() }),
  z.object({
    action: z.literal("job").describe("Start or reuse an active local AI job."),
    snapshotId: z
      .uuid()
      .describe("Identifier of the immutable snapshot to analyze."),
    kind: z
      .enum(jobKinds)
      .describe("Whether to group changed files or run a correctness review."),
    expectedHash: z.string().optional(),
    expectedRound: z.number().int().positive().optional(),
    priority: z.enum(jobPriorities).optional(),
  }),
  z.object({ action: z.literal("retry"), id: z.uuid() }),
  z.object({
    action: z.literal("priority"),
    id: z.uuid(),
    priority: z.enum(jobPriorities),
  }),
  z.object({
    action: z.literal("cancel").describe("Cancel an active local AI job."),
    id: z.uuid().describe("Identifier of the job to cancel."),
  }),
  z.object({
    action: z.literal("create").describe("Create a saved conversation."),
    snapshotId: z
      .uuid()
      .describe("Identifier of the snapshot this conversation will discuss."),
  }),
  z.object({
    action: z.literal("rename").describe("Rename a saved conversation."),
    id: z.uuid().describe("Identifier of the conversation to rename."),
    title: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .describe("New user-facing conversation title."),
  }),
  z.object({
    action: z
      .literal("delete")
      .describe("Delete a saved conversation and its messages."),
    id: z.uuid().describe("Identifier of the conversation to delete."),
  }),
]);
export type AgentActionSchema = z.infer<typeof agentActionSchema>;
export const chatTurnSchema = z.object({
  conversationId: z
    .uuid()
    .describe(
      "Identifier of the saved snapshot conversation receiving this turn.",
    ),
  messageId: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe(
      "Stable user message ID; reuse it when retrying the same interrupted question.",
    ),
  model: modelSelectionSchema.describe(
    "Configured provider connection and exact model chosen for this chat turn.",
  ),
  content: z
    .string()
    .trim()
    .min(1, "Enter a message before sending.")
    .max(10000, "Keep your message under 10,000 characters.")
    .describe("The user's question or request about the selected changes."),
});
export type ChatTurnSchema = z.infer<typeof chatTurnSchema>;

export const agentFormSchema = chatTurnSchema.pick({ content: true });
export type AgentFormSchema = z.infer<typeof agentFormSchema>;
export const explainRequestSchema = z.object({
  snapshotId: z
    .uuid()
    .describe(
      "Identifier of the immutable review snapshot containing the selected code.",
    ),
  path: z
    .string()
    .min(1)
    .max(4096)
    .describe(
      "Exact repository-relative path of the selected changed text file.",
    ),
  side: z
    .enum(evidenceSides)
    .describe(
      "Source to explain: before for original code, after for changed code.",
    ),
  start: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Inclusive 1-based starting line; omit to start at the first line.",
    ),
  end: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Inclusive 1-based ending line; omit to include the rest of the selected file side.",
    ),
});
export type ExplainRequestSchema = z.infer<typeof explainRequestSchema>;

export const historyKinds = ["reviews", "conversations"] as const;
export type HistoryKind = (typeof historyKinds)[number];
export const agentHistorySchema = z.object({
  items: z
    .array(z.union([jobSchema, conversationSchema.omit({ messages: true })]))
    .describe(
      "Saved review jobs or conversation summaries in the requested history page.",
    ),
  next: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .describe(
      "Offset for the next history page, or null when no more entries exist.",
    ),
});
export type AgentHistorySchema = z.infer<typeof agentHistorySchema>;
