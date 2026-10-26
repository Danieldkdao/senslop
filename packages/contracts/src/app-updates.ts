import { z } from "zod";

export const installationKinds = ["npm", "pnpm", "source", "unknown"] as const;
export type InstallationKind = (typeof installationKinds)[number];
export const updateStatuses = [
  "current",
  "available",
  "unpublished",
  "unavailable",
] as const;
export type UpdateStatus = (typeof updateStatuses)[number];
export const appUpdateSchema = z.object({
  current: z.string(),
  latest: z.string().nullable(),
  available: z.boolean(),
  status: z.enum(updateStatuses),
  checkedAt: z.iso.datetime(),
  installation: z.enum(installationKinds).default("unknown"),
});
export type AppUpdateSchema = z.infer<typeof appUpdateSchema>;
