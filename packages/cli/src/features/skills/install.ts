import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readlink,
  rename,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { CliError } from "../commands/errors.js";

const readInstalledSkill = async (
  path: string,
  content: string,
  linkedTarget?: string,
) => {
  const entry = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!entry) return null;
  const managedLink =
    entry.isSymbolicLink() &&
    linkedTarget !== undefined &&
    resolve(dirname(path), await readlink(path)) === linkedTarget;
  const existingContent =
    entry.isFile() || managedLink
      ? await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return null;
          throw error;
        })
      : null;
  if (existingContent !== content)
    throw new CliError(
      "An existing senslop-review skill differs or uses an unsupported link. Review it before replacing it; installation will not overwrite it.",
      "skill_exists",
    );
  return managedLink ? "symlink" : "file";
};

export const installReviewSkill = async (
  root: string,
  agent: "agents" | "claude" | "both" = "agents",
  symlinkSkills = false,
) => {
  const content = await readFile(
    new URL("./skills/senslop-review/SKILL.md", import.meta.url),
    "utf8",
  ).catch(() =>
    readFile(
      new URL("../../../skills/senslop-review/SKILL.md", import.meta.url),
      "utf8",
    ),
  );
  const agentsPath = resolve(
    root,
    ".agents",
    "skills",
    "senslop-review",
    "SKILL.md",
  );
  const claudePath = resolve(
    root,
    ".claude",
    "skills",
    "senslop-review",
    "SKILL.md",
  );
  const paths =
    agent === "both"
      ? [agentsPath, claudePath]
      : [agent === "claude" ? claudePath : agentsPath];
  const targets = await Promise.all(
    paths.map(async (path) => ({
      path,
      existing: await readInstalledSkill(
        path,
        content,
        path === claudePath ? agentsPath : undefined,
      ),
    })),
  );
  let installed = false;
  for (const { path, existing } of targets) {
    const linked = agent === "both" && symlinkSkills && path === claudePath;
    if (
      (existing === "file" && !linked) ||
      (existing === "symlink" && (linked || agent !== "both"))
    )
      continue;
    await mkdir(dirname(path), { recursive: true });
    // Replace only a verified bundled copy, keeping the old file intact until its replacement is ready.
    const pending = existing
      ? join(dirname(path), `senslop-skill-${randomUUID()}.pending`)
      : path;
    try {
      if (linked) {
        await symlink(
          relative(dirname(path), agentsPath),
          pending,
          "file",
        ).catch(() => {
          throw new CliError(
            "Could not create the Claude skill symlink. Retry with --no-symlink to install separate files.",
            "symlink_failed",
          );
        });
      } else await writeFile(pending, content, { flag: "wx" });
      if (existing) await rename(pending, path);
      installed = true;
    } finally {
      if (existing) await unlink(pending).catch(() => {});
    }
  }
  return {
    installed,
    path: paths[0]!,
    paths,
    symlink:
      agent === "both" ? symlinkSkills : targets[0]?.existing === "symlink",
  };
};
