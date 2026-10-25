import { simpleGit } from "simple-git";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { workspaceSessionSchema } from "@senslop/contracts";
import { workspaceStateDirectory } from "./runtime-paths";
import type { LocalStore } from "../../db/local-store";

export const knownProjectRoots = (store: LocalStore, current: string) => [
  ...new Set([
    current,
    ...store.database
      .prepare("SELECT DISTINCT repository FROM reviews")
      .all()
      .map((row) => String(row.repository)),
    ...store.database
      .prepare(
        "SELECT value FROM preferences WHERE name LIKE 'known_project:%'",
      )
      .all()
      .flatMap((row) => {
        try {
          return [String(JSON.parse(String(row.value)).root)];
        } catch {
          return [];
        }
      }),
  ]),
];

export const discoverProjectSession = async (
  dataDirectory: string,
  root: string,
  fetcher: typeof fetch = fetch,
) => {
  try {
    const session = workspaceSessionSchema.parse(
      JSON.parse(
        await readFile(
          join(workspaceStateDirectory(dataDirectory, root), "session.json"),
          "utf8",
        ),
      ),
    );
    if (session.repository !== root) return null;
    const health = await fetcher(`${session.origin}/api/health`, {
      headers: { Authorization: `Bearer ${session.token}` },
      redirect: "error",
      signal: AbortSignal.timeout(1000),
    });
    const valid =
      health.ok && health.headers.get("X-Senslop-Session") === session.token;
    await health.body?.cancel();
    return valid ? session : null;
  } catch {
    return null;
  }
};

export const discoverWorktrees = async (repository: string) => {
  const text = await simpleGit(repository).raw([
    "worktree",
    "list",
    "--porcelain",
    "-z",
  ]);
  return text
    .split("\0\0")
    .filter(Boolean)
    .flatMap((entry) => {
      const fields = entry.split("\0");
      const root = fields
        .find((field) => field.startsWith("worktree "))
        ?.slice(9);
      if (!root || fields.includes("bare")) return [];
      return [
        {
          root,
          branch:
            fields
              .find((field) => field.startsWith("branch "))
              ?.slice(7)
              .replace(/^refs\/heads\//, "") ?? null,
          head:
            fields.find((field) => field.startsWith("HEAD "))?.slice(5) ?? null,
        },
      ];
    });
};
