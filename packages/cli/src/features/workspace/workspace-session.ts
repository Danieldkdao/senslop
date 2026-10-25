import { chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { readFileSync, unlinkSync, renameSync } from "node:fs";
import { withWorkspaceState } from "./workspace-owner.js";
import { join } from "node:path";
import { z } from "zod";
import { workspaceStateDirectory } from "./runtime-paths.js";

const workspaceSessionSchema = z
  .object({
    version: z.literal(1),
    repository: z.string().min(1),
    origin: z.url().refine((value) => {
      const url = new URL(value);
      return (
        url.protocol === "http:" &&
        url.hostname === "127.0.0.1" &&
        !!url.port &&
        value === url.origin
      );
    }),
    token: z.string().regex(/^[a-f0-9]{64}$/),
    pid: z.number().int().positive(),
  })
  .strict();
export type WorkspaceSessionSchema = z.infer<typeof workspaceSessionSchema>;

export const workspaceSessionPath = (directory: string, repository: string) =>
  join(workspaceStateDirectory(directory, repository), "session.json");

export const publishWorkspaceSession = async (
  directory: string,
  session: WorkspaceSessionSchema,
) => {
  const validated = workspaceSessionSchema.parse(session);
  const state = workspaceStateDirectory(directory, session.repository);
  await mkdir(state, { recursive: true, mode: 0o700 });
  await chmod(state, 0o700);
  const pending = join(state, `session-${randomUUID()}.pending`);
  try {
    await writeFile(pending, JSON.stringify(validated), {
      flag: "wx",
      mode: 0o600,
    });
    withWorkspaceState(directory, session.repository, () => {
      renameSync(pending, workspaceSessionPath(directory, session.repository));
    });
  } finally {
    await unlink(pending).catch(() => {});
  }
};

export const readWorkspaceSession = async (
  directory: string,
  repository: string,
) => {
  const session = workspaceSessionSchema.parse(
    JSON.parse(
      await readFile(workspaceSessionPath(directory, repository), "utf8"),
    ),
  );
  if (session.repository !== repository)
    throw new Error("The workspace session belongs to another repository.");
  return session;
};

export const removeWorkspaceSession = async (
  directory: string,
  session: WorkspaceSessionSchema,
) => {
  withWorkspaceState(directory, session.repository, () => {
    const path = workspaceSessionPath(directory, session.repository);
    let existingSession: WorkspaceSessionSchema;
    try {
      existingSession = workspaceSessionSchema.parse(
        JSON.parse(readFileSync(path, "utf8")),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    if (existingSession.token === session.token) unlinkSync(path);
  });
};
