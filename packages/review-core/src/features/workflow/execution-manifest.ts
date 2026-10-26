import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  lstat,
  mkdir,
  chmod,
  realpath,
  rm,
  writeFile,
  readdir,
} from "node:fs/promises";
import { dirname, join, basename } from "node:path";
import { simpleGit } from "simple-git";
import {
  executionManifestSchema,
  type SavedReviewSchema,
  type ExecutionManifestSchema,
} from "@senslop/contracts";
import type { LocalStore } from "../../db/local-store";
import { listSourcePaths, readRepository } from "../git/repository";
import { localBytes } from "../git/snapshot";
import {
  readProjectPolicy,
  allowsSourcePath,
  sourcePolicyHash,
} from "./project-policy";
import { WorkflowStore } from "./workflow-store";
import { writeExecutionGitSources } from "./execution-git-sources";

export const hashExecutionBytes = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");

const hashExecutionFile = async (path: string) => {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest("hex");
};
export const readExecutionManifest = (
  store: LocalStore,
  repository: string,
  id: string,
) => {
  const row = store.database
    .prepare(
      "SELECT m.body FROM execution_manifests m JOIN reviews r ON r.id=m.review_id WHERE m.id=? AND r.repository=?",
    )
    .get(id, repository);
  if (!row) throw new Error("Managed workspace not found in this repository.");
  return executionManifestSchema.parse(JSON.parse(String(row.body)));
};

export const materializeReview = async (
  store: LocalStore,
  root: string,
  review: SavedReviewSchema,
  parent: string,
  sourceSide: "changed" | "base" = "changed",
): Promise<ExecutionManifestSchema> => {
  new WorkflowStore(store, root).requireReview(review.id, review);
  const policy = readProjectPolicy(store, root);
  const capturedChanges =
    review.source.kind === "working-tree"
      ? (review.syncBaseline ?? review.files)
      : review.files;
  if (
    [...review.files, ...capturedChanges].some(
      (file) =>
        !allowsSourcePath(policy, file.path) ||
        (file.oldPath && !allowsSourcePath(policy, file.oldPath)),
    )
  )
    throw new Error(
      "Source policy changed. Capture a new review before execution.",
    );
  const current = await readRepository(root);
  if (
    sourceSide === "changed" &&
    review.source.kind === "working-tree" &&
    (!review.fingerprint ||
      current.fingerprint !== review.fingerprint ||
      current.head !== review.repositoryState?.head)
  )
    throw new Error(
      "Repository changed. Re-sync before creating an execution workspace.",
    );
  const base =
    sourceSide === "base"
      ? review.source.base
      : (review.source.head ??
        review.repositoryState?.head ??
        review.source.base);
  const id = randomUUID();
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const directory = join(await realpath(parent), id);
  const removedPaths = new Set(
    sourceSide === "base"
      ? []
      : capturedChanges.flatMap((file) => [
          ...(file.oldPath && file.oldPath !== file.path ? [file.oldPath] : []),
          ...(file.afterHash === null ? [file.path] : []),
        ]),
  );
  const paths = (await listSourcePaths(root, base)).filter(
    (path) => allowsSourcePath(policy, path) && !removedPaths.has(path),
  );
  const git = simpleGit(root);
  await git.raw([
    "worktree",
    "add",
    "--detach",
    "--no-checkout",
    directory,
    base,
  ]);
  try {
    const capturedFiles = new Map(
      (await writeExecutionGitSources(root, base, paths, directory)).map(
        (file) => [file.path, file],
      ),
    );
    for (const file of sourceSide === "base" ? [] : capturedChanges) {
      if (file.afterHash === null) continue;
      let bytes: Buffer;
      if (file.binary) {
        const live = await localBytes(root, file.path, 20 * 1024 * 1024);
        if (!live.bytes || hashExecutionBytes(live.bytes) !== file.afterHash)
          throw new Error(
            `Exact binary execution input unavailable: ${file.path}`,
          );
        bytes = live.bytes;
      } else {
        if (file.after === null)
          throw new Error(`Execution input unavailable: ${file.path}`);
        bytes = Buffer.from(file.after);
      }
      const mode =
        review.source.kind === "working-tree"
          ? (await lstat(join(root, file.path))).mode & 0o777
          : (capturedFiles.get(file.path)?.mode ?? 0o644);
      const destination = join(directory, file.path);
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
      await writeFile(destination, bytes, { mode });
      await chmod(destination, mode);
      capturedFiles.set(file.path, {
        path: file.path,
        hash: hashExecutionBytes(bytes),
        mode,
      });
    }
    await simpleGit(directory).raw(["read-tree", base]);
    if (
      sourceSide === "changed" &&
      review.source.kind === "working-tree" &&
      (await readRepository(root)).fingerprint !== review.fingerprint
    )
      throw new Error(
        "Repository changed during source materialization. Re-sync and retry.",
      );
    new WorkflowStore(store, root).requireReview(review.id, review);
    const files = [...capturedFiles.values()].sort((a, b) =>
      a.path.localeCompare(b.path),
    );
    const dependencyHash = hashExecutionBytes(
      files
        .filter((file) =>
          /(^|\/)(package\.json|.*lock.*|.*requirements.*|pyproject\.toml|Cargo\.toml|go\.mod)$/.test(
            file.path,
          ),
        )
        .map((file) => `${file.path}:${file.hash}`)
        .join("\n"),
    );
    const manifest = executionManifestSchema.parse({
      id,
      sourceSide,
      review: { id: review.id, hash: review.hash, round: review.round },
      directory,
      base,
      policyHash: sourcePolicyHash(policy),
      files,
      dependencyHash,
      createdAt: new Date().toISOString(),
    });
    store.database
      .prepare("INSERT INTO execution_manifests VALUES (?,?,?)")
      .run(id, review.id, JSON.stringify(manifest));
    return manifest;
  } catch (error) {
    await git.raw(["worktree", "remove", "--force", directory]).catch(() => {});
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
};

export const executionSourceChanged = async (
  manifest: ExecutionManifestSchema,
  generatedPaths: string[] = [],
) => {
  for (const file of manifest.files) {
    try {
      const path = join(manifest.directory, file.path);
      const info = await lstat(path);
      if (
        !info.isFile() ||
        (await hashExecutionFile(path)) !== file.hash ||
        (info.mode & 0o777) !== file.mode
      )
        return true;
    } catch {
      return true;
    }
  }
  const recorded = new Set(manifest.files.map((file) => file.path));
  const generated = new Set(generatedPaths);
  const hasExtraSource = async (directory: string): Promise<boolean> => {
    for (const entry of await readdir(join(manifest.directory, directory), {
      withFileTypes: true,
    })) {
      // Match capture's dependency/build exclusions, without trusting the mutable index or ignore rules.
      if (
        [".git", "node_modules", ".next", "dist", "build", "coverage"].includes(
          entry.name,
        )
      )
        continue;
      const path = directory ? `${directory}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (await hasExtraSource(path)) return true;
      } else if (!recorded.has(path) && !generated.has(path)) return true;
    }
    return false;
  };
  return hasExtraSource("");
};

export const removeManagedWorkspace = async (
  store: LocalStore,
  repository: string,
  id: string,
  discard = false,
) => {
  const manifest = readExecutionManifest(store, repository, id);
  if (manifest.removedAt) return manifest;
  if (
    basename(manifest.directory) !== id ||
    (await realpath(manifest.directory)) !== manifest.directory
  )
    throw new Error("Managed workspace identity changed. Cleanup blocked.");
  if (!discard && (await executionSourceChanged(manifest)))
    throw new Error(
      "Workspace contains newer changes. Review or explicitly discard them before cleanup.",
    );
  const active = store.database
    .prepare(
      "SELECT 1 FROM fix_tasks WHERE json_extract(body,'$.manifestId')=? AND json_extract(body,'$.status') IN ('ready','in-progress','returned') UNION SELECT 1 FROM check_runs WHERE json_extract(body,'$.manifestId')=? AND json_extract(body,'$.status') IN ('queued','running') OR (json_extract(body,'$.manifestId')=? AND json_extract(body,'$.ownerPid') IS NOT NULL)",
    )
    .get(id, id, id);
  if (active) throw new Error("Workspace is in use by a task or check.");
  await simpleGit(repository).raw([
    "worktree",
    "remove",
    "--force",
    manifest.directory,
  ]);
  const removed = { ...manifest, removedAt: new Date().toISOString() };
  store.database
    .prepare("UPDATE execution_manifests SET body=? WHERE id=?")
    .run(JSON.stringify(removed), id);
  return removed;
};
