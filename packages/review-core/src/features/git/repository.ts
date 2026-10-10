import { createHash } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import {
  sourceSelectionSchema,
  type SourceSelectionSchema,
} from "@senslop/contracts";
import { collectSnapshot, secretReason } from "./snapshot";

export { collectSnapshot, SNAPSHOT_LIMITS } from "./snapshot";
export type { FrozenSnapshot, GitSource, SnapshotFile } from "./snapshot";

export const resolveRepository = async (cwd: string) =>
  realpath((await simpleGit(cwd).revparse(["--show-toplevel"])).trim());

const readFreshness = async (root: string, head: string, branch: string) => {
  const records = (
    await simpleGit({
      baseDir: root,
      trimmed: false,
      allowEnvironment: ["GIT_OPTIONAL_LOCKS"],
    })
      .env("GIT_OPTIONAL_LOCKS", "0")
      .raw(["status", "--porcelain=v2", "-z", "--untracked-files=all"])
  ).split("\0");
  const hash = createHash("sha256").update(JSON.stringify({ head, branch }));
  for (let index = 0; index < records.length; index++) {
    const record = records[index]!;
    if (!record) continue;
    const fields = record.split(" ");
    let pathOffset: number;
    switch (fields[0]) {
      case "1":
        pathOffset = 8;
        break;
      case "2":
        pathOffset = 9;
        break;
      case "u":
        pathOffset = 10;
        break;
      case "?":
        pathOffset = 1;
        break;
      default:
        continue;
    }
    const path = fields.slice(pathOffset).join(" ");
    const oldPath = fields[0] === "2" ? records[++index] : null;
    if (secretReason(path) || (oldPath && secretReason(oldPath))) continue;
    let metadata: string[] | null = null;
    try {
      const info = await lstat(join(root, path), { bigint: true });
      // Metadata catches edits with unchanged Git status without reading or diffing source.
      metadata = [
        info.mode,
        info.size,
        info.mtimeNs,
        info.ctimeNs,
        info.ino,
      ].map(String);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    hash.update(JSON.stringify({ record, oldPath, metadata }));
  }
  return hash.digest("hex");
};

export const readRepository = async (cwd: string) => {
  const root = await resolveRepository(cwd);
  const git = simpleGit(root);
  const branches = await git.branchLocal();
  const head = (await git.revparse(["HEAD"])).trim();
  const log = await git.log({ maxCount: 100, "--all": null });
  const fingerprint = await readFreshness(root, head, branches.current).catch(
    () => null,
  );
  return {
    root,
    branch: branches.current || "Detached HEAD",
    head,
    branches: branches.all,
    commits: log.all.map((commit) => ({
      id: commit.hash,
      subject: commit.message,
      date: commit.date,
    })),
    fingerprint,
  };
};

export const inspectRepository = async (
  cwd: string,
  input: SourceSelectionSchema,
) => {
  const source = sourceSelectionSchema.parse(input);
  const before = await readRepository(cwd);
  const snapshot = await collectSnapshot({ cwd: before.root, source });
  const after = await readRepository(cwd);
  if (
    before.head !== after.head ||
    before.branch !== after.branch ||
    before.fingerprint !== after.fingerprint
  )
    throw new Error(
      "Repository changed during inspection. Retry to freeze a consistent review.",
    );
  if (!snapshot.files.length)
    throw new Error(
      "No changed files to inspect. Choose another Git selection.",
    );
  return { snapshot, selection: source, fingerprint: after.fingerprint };
};
