import { z } from "zod";
export * from "./lib/constants";

export const sourceSelectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("commit"), commit: z.string().min(1) }),
  z.object({
    kind: z.literal("range"),
    base: z.string().min(1),
    head: z.string().min(1),
  }),
  z.object({ kind: z.literal("working-tree") }),
  z.object({
    kind: z.literal("branch"),
    branch: z.string().min(1),
    base: z.string().min(1),
  }),
]);
export type SourceSelectionSchema = z.infer<typeof sourceSelectionSchema>;

export const deviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  connectedAt: z.iso.datetime(),
});
export type DeviceSchema = z.infer<typeof deviceSchema>;

export const presenceEventTypes = [
  "cli.connected",
  "cli.disconnected",
] as const;
export type PresenceEventType = (typeof presenceEventTypes)[number];

export const presenceEventSchema = z.union([
  z.object({
    type: z.literal("presence.snapshot"),
    devices: z.array(deviceSchema),
  }),
  z.object({
    type: z.enum(presenceEventTypes),
    deviceId: z.string(),
    timestamp: z.iso.datetime(),
  }),
]);
export type PresenceEventSchema = z.infer<typeof presenceEventSchema>;

export const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
  details: z.unknown().optional(),
});

export const eligibility = (
  files: ReadonlyArray<{
    binary: boolean;
    additions: number;
    deletions: number;
  }>,
) => {
  const qualifyingFiles = files.filter(
    (f) => !f.binary && f.additions + f.deletions >= 10,
  ).length;
  return {
    eligible: qualifyingFiles >= 5,
    qualifyingFiles,
    requiredFiles: 5,
    requiredChangedLines: 10,
  };
};

export const secureBaseURL = (value: string): string => {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error(
      "Use a website origin without credentials, path, query or fragment.",
    );
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  )
    throw new Error("Use HTTPS, or HTTP for localhost development only.");
  return url.origin;
};

export const cliStatusSchema = z.object({
  user: z.object({ id: z.string().min(1), name: z.string(), email: z.email() }),
  deviceId: z.string().min(1),
  deviceName: z.string(),
  connectionUrl: z.url(),
});

export type CliStatusSchema = z.infer<typeof cliStatusSchema>;
export const connectionTicketSchema = z.object({
  ticket: z.string().min(1),
  expiresAt: z.iso.datetime(),
  connectionUrl: z.url(),
});
export type ErrorSchema = z.infer<typeof errorSchema>;
export type ConnectionTicketSchema = z.infer<typeof connectionTicketSchema>;

export * from "./preview";
export * from "./local-review";
export * from "./providers";
export * from "./compatible-models";

export * from "./provider-formatters";
export * from "./workflow";
