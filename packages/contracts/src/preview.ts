import { z } from "zod";
import { MAX_FILE_BYTES, PROTOCOL_VERSION } from "./lib/constants";

export const previewSourceKinds = [
  "commit",
  "range",
  "working-tree",
  "branch",
] as const;
export type PreviewSourceKind = (typeof previewSourceKinds)[number];
export const previewSourceSchema = z.object({
  kind: z.enum(previewSourceKinds),
  base: z.string().regex(/^[a-f0-9]{40,64}$/),
  head: z
    .string()
    .regex(/^[a-f0-9]{40,64}$/)
    .nullable(),
  firstParent: z.boolean(),
});
export type PreviewSourceSchema = z.infer<typeof previewSourceSchema>;

export const previewFileSchema = z.object({
  path: z.string().min(1).max(4096),
  oldPath: z.string().min(1).max(4096).nullable(),
  status: z.string().regex(/^[AMDRCTU][0-9]*$/),
  before: z.string().max(MAX_FILE_BYTES).nullable(),
  after: z.string().max(MAX_FILE_BYTES).nullable(),
  beforeHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  afterHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  binary: z.boolean(),
  added: z.number().int().nonnegative(),
  deleted: z.number().int().nonnegative(),
  diff: z.string().max(8 * MAX_FILE_BYTES),
});
export type PreviewFileSchema = z.infer<typeof previewFileSchema>;

export const previewExcludedSchema = z.object({
  path: z.string().max(4096),
  reason: z.string().max(512),
});
export type PreviewExcludedSchema = z.infer<typeof previewExcludedSchema>;

export const previewUploadSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  source: previewSourceSchema,
  files: z.array(previewFileSchema).min(1).max(2000),
  excluded: z.array(previewExcludedSchema).max(2000),
});
export type PreviewUploadSchema = z.infer<typeof previewUploadSchema>;

export const previewEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("preview.start"),
    previewId: z.uuid(),
    source: previewSourceSchema,
    fileCount: z.number().int().positive().max(2000),
    excluded: z.array(previewExcludedSchema).max(2000),
  }),
  z.object({
    type: z.literal("preview.file"),
    previewId: z.uuid(),
    index: z.number().int().nonnegative(),
    file: previewFileSchema,
  }),
  z.object({ type: z.literal("preview.complete"), previewId: z.uuid() }),
  z.object({
    type: z.literal("preview.failed"),
    previewId: z.uuid(),
    message: z.string().max(512),
  }),
]);
export type PreviewEventSchema = z.infer<typeof previewEventSchema>;
