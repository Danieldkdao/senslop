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
