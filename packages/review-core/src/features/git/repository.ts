import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { simpleGit } from "simple-git";
import {
  sourceSelectionSchema,
  type SourceSelectionSchema,
} from "@senslop/contracts";
import { collectSnapshot } from "./snapshot";

export { collectSnapshot, SNAPSHOT_LIMITS } from "./snapshot";
export type { FrozenSnapshot, GitSource, SnapshotFile } from "./snapshot";

export const resolveRepository = async (cwd: string) =>
  realpath((await simpleGit(cwd).revparse(["--show-toplevel"])).trim());

export const readRepository = async (cwd: string) => {
  const root = await resolveRepository(cwd);
  const git = simpleGit(root);
  const branches = await git.branchLocal();
  const head = (await git.revparse(["HEAD"])).trim();
  const log = await git.log({ maxCount: 100, "--all": null });
  const working = await collectSnapshot({
    cwd: root,
    source: { kind: "working-tree" },
  }).catch(() => null);
  const fingerprint = working
    ? createHash("sha256")
        .update(
          JSON.stringify({
            head,
            branch: branches.current,
            hash: working.hash,
          }),
        )
        .digest("hex")
    : null;
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
