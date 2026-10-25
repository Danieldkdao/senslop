import { createHash } from "node:crypto";
import { join } from "node:path";

export const workspaceStateDirectory = (
  dataDirectory: string,
  repository: string,
) =>
  join(
    dataDirectory,
    "jobs",
    createHash("sha256").update(repository).digest("hex").slice(0, 20),
  );
