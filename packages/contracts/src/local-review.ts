import { z } from "zod";
import { previewFileSchema, localPreviewSchema } from "./preview";

export const reviewLineSides = ["additions", "deletions"] as const;
export type ReviewLineSide = (typeof reviewLineSides)[number];
export const reviewLineSchema = z
  .object({
    side: z.enum(reviewLineSides),
    lineNumber: z.number().int().positive(),
    endLineNumber: z.number().int().positive().optional(),
    code: z.string().max(1024 * 1024),
  })
  .refine(
    (line) => (line.endLineNumber ?? line.lineNumber) >= line.lineNumber,
    {
      message: "The end line must follow the start line.",
      path: ["endLineNumber"],
    },
  );
export type ReviewLineSchema = z.infer<typeof reviewLineSchema>;

export const localNoteSchema = z.object({
  id: z.uuid(),
  previewId: z.uuid(),
  path: z.string().min(1).max(4096),
  body: z.string().trim().min(1).max(5000),
  line: reviewLineSchema.nullable(),
});
export type LocalNoteSchema = z.infer<typeof localNoteSchema>;

export const resyncModes = ["new", "keep"] as const;
export type ResyncMode = (typeof resyncModes)[number];

export const savedReviewSchema = localPreviewSchema.extend({
  repositoryState: z
    .object({
      branch: z.string().min(1),
      head: z.string().regex(/^[a-f0-9]{40,64}$/),
    })
    .optional(),
  syncBaseline: z.array(previewFileSchema).max(2000).optional(),
  previousReviewId: z.uuid().optional(),
  resyncMode: z.enum(resyncModes).optional(),
  round: z.number().int().positive().default(1),
  groupingEnabled: z
    .boolean()
    .optional()
    .describe(
      "Whether this snapshot requires grouped files and summaries; legacy snapshots use the default enabled behavior.",
    ),
  title: z.string().trim().min(1).max(200),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  fingerprint: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  revision: z.number().int().nonnegative(),
  notes: z.array(localNoteSchema).max(5000),
  completedPaths: z.array(z.string().max(4096)).max(2000),
  selectedPath: z.string().max(4096).nullable(),
});
export type SavedReviewSchema = z.infer<typeof savedReviewSchema>;

export const reviewStateSchema = savedReviewSchema.pick({
  id: true,
  hash: true,
  round: true,
  revision: true,
  title: true,
  updatedAt: true,
  notes: true,
  completedPaths: true,
  selectedPath: true,
});
export type ReviewStateSchema = z.infer<typeof reviewStateSchema>;

export const reviewChangeSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("rename"),
    title: z.string().trim().min(1).max(200),
  }),
  z.object({ action: z.literal("add-note"), note: localNoteSchema }),
  z.object({
    action: z.literal("edit-note"),
    id: z.uuid(),
    body: localNoteSchema.shape.body,
  }),
  z.object({ action: z.literal("delete-note"), id: z.uuid() }),
  z.object({ action: z.literal("select"), path: z.string().min(1).max(4096) }),
  z.object({
    action: z.literal("complete"),
    path: z.string().min(1).max(4096),
    complete: z.boolean(),
  }),
]);
export type ReviewChangeSchema = z.infer<typeof reviewChangeSchema>;
