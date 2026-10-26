import { z } from "zod";

export const notificationKinds = [
  "grouping",
  "review",
  "checks",
  "verification",
  "fix",
  "attention",
  "chat",
  "explanation",
  "git",
  "updates",
] as const;
export type NotificationKind = (typeof notificationKinds)[number];
export const notificationPreferencesSchema = z.object({
  enabled: z.boolean(),
  foreground: z.boolean(),
  showNames: z.boolean(),
  categories: z.record(z.enum(notificationKinds), z.boolean()),
});
export type NotificationPreferencesSchema = z.infer<
  typeof notificationPreferencesSchema
>;
export const notificationEventSchema = z.object({
  sequence: z.number(),
  id: z.string(),
  kind: z.enum(notificationKinds),
  reviewId: z.string().nullable(),
  title: z.string(),
  destination: z.string(),
  createdAt: z.iso.datetime(),
});
export type NotificationEventSchema = z.infer<typeof notificationEventSchema>;
