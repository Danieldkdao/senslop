import { z } from "zod";
import {
  correctnessSchema,
  findingSchema,
  groupingSchema,
} from "../../features/agents/schemas";

export const groupingRepairGroupSchema = groupingSchema.shape.groups.element
  .omit({ files: true })
  .extend({ index: z.number().int().min(0).max(1999) });
export type GroupingRepairGroupSchema = z.infer<
  typeof groupingRepairGroupSchema
>;
export const groupingRepairFileSchema =
  groupingSchema.shape.groups.element.shape.files.element.extend({
    groupIndex: z.number().int().min(0).max(1999),
    beforePath: z.string().max(4096).nullable(),
  });
export type GroupingRepairFileSchema = z.infer<typeof groupingRepairFileSchema>;
export const groupingRepairSchema = z.object({
  groups: z.array(groupingRepairGroupSchema).max(32),
  files: z.array(groupingRepairFileSchema).max(2000),
});
export type GroupingRepairSchema = z.infer<typeof groupingRepairSchema>;
export const placementRepairSchema = groupingRepairSchema.extend({
  files: z
    .array(
      groupingRepairFileSchema.pick({
        path: true,
        groupIndex: true,
        beforePath: true,
      }),
    )
    .max(2000),
});
export type PlacementRepairSchema = z.infer<typeof placementRepairSchema>;
export const reviewFileSchema = z.object({
  path: z.string().min(1).max(4096),
  findings: z.array(findingSchema).max(300),
});
export type ReviewFileSchema = z.infer<typeof reviewFileSchema>;
export const reviewBatchSchema = correctnessSchema
  .pick({ limitations: true })
  .extend({
    files: z.array(reviewFileSchema).max(2000),
    // Limit individual model responses, not the merged review or its checkpoints.
    limitations: correctnessSchema.shape.limitations.max(30),
  });
export type ReviewBatchSchema = z.infer<typeof reviewBatchSchema>;
export const createReviewBatchSchema = (paths: string[]) =>
  reviewBatchSchema.extend({
    files: z
      .array(reviewFileSchema.extend({ path: z.literal(paths) }))
      .min(paths.length)
      .max(paths.length)
      .describe(
        "Return exactly one assessment for each listed path, including findings: [] when no bug is established.",
      ),
  });
export type CreateReviewBatchSchema = z.infer<
  ReturnType<typeof createReviewBatchSchema>
>;
export const reviewRepairFindingSchema = z.object({
  id: z.string().min(1).max(80),
  finding: findingSchema.nullable(),
});
export type ReviewRepairFindingSchema = z.infer<
  typeof reviewRepairFindingSchema
>;
export const reviewRepairSchema = reviewBatchSchema.extend({
  findings: z.array(reviewRepairFindingSchema).max(300),
});
export type ReviewRepairSchema = z.infer<typeof reviewRepairSchema>;
export const createReviewRepairSchema = (
  paths: string[],
  ids: string[],
  repairLimitations: boolean,
) =>
  reviewRepairSchema.extend({
    files: z
      .array(
        paths.length
          ? reviewFileSchema.extend({ path: z.literal(paths) })
          : reviewFileSchema,
      )
      .min(paths.length)
      .max(paths.length)
      .describe(
        "Only the requested missing file assessments. Return [] if none are requested.",
      ),
    findings: z
      .array(
        ids.length
          ? reviewRepairFindingSchema.extend({ id: z.literal(ids) })
          : reviewRepairFindingSchema,
      )
      .min(ids.length)
      .max(ids.length)
      .describe(
        "One replacement per requested finding ID. Use {id, finding: null} to retract an unsupported finding. Never return bare null entries.",
      ),
    limitations: reviewBatchSchema.shape.limitations
      .max(repairLimitations ? 30 : 0)
      .describe(
        repairLimitations
          ? "Return corrected analysis limitations, or [] when none apply."
          : "Limitations are already accepted. Return [].",
      ),
  });
export type CreateReviewRepairSchema = z.infer<
  ReturnType<typeof createReviewRepairSchema>
>;
