import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
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
import { readBlobBatch, localBytes } from "../git/snapshot";
import {
  readProjectPolicy,
  allowsSourcePath,
  sourcePolicyHash,
} from "./project-policy";
import { WorkflowStore } from "./workflow-store";

export const hashExecutionBytes = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
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
  if (
    review.files.some(
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
  const paths = (await listSourcePaths(root, base)).filter((path) =>
    allowsSourcePath(policy, path),
  );
  const captured = await readBlobBatch(
    root,
    base,
    paths,
    20 * 1024 * 1024,
    true,
  );
  if (captured.limited || captured.unavailable.length)
    throw new Error(
      `Execution inputs exceed capture limits or contain unsupported files: ${captured.unavailable.join(", ") || "20 MiB execution source limit"}.`,
    );
  const contents = new Map(Object.entries(captured.binarySources));
  const modes = new Map(Object.entries(captured.modes));
  for (const file of sourceSide === "base" ? [] : review.files) {
    if (file.oldPath && file.oldPath !== file.path) {
      contents.delete(file.oldPath);
      modes.delete(file.oldPath);
    }
    if (file.afterHash === null) {
      contents.delete(file.path);
      modes.delete(file.path);
      continue;
    }
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
    contents.set(file.path, bytes);
    if (review.source.kind === "working-tree")
      modes.set(file.path, (await lstat(join(root, file.path))).mode & 0o777);
    else modes.set(file.path, modes.get(file.path) ?? 0o644);
  }
  if (
    [...contents.values()].reduce((size, bytes) => size + bytes.length, 0) >
    20 * 1024 * 1024
  )
    throw new Error(
      "Execution source exceeds 20 MiB. No partial execution was started.",
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
    for (const [path, bytes] of contents) {
      const destination = join(directory, path);
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
      await writeFile(destination, bytes, {
        mode: (modes.get(path) ?? 0o644) & 0o777,
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
    const files = [...contents]
      .map(([path, bytes]) => ({
        path,
        hash: hashExecutionBytes(bytes),
        mode: (modes.get(path) ?? 0o644) & 0o777,
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
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
        hashExecutionBytes(await readFile(path)) !== file.hash ||
        (info.mode & 0o777) !== file.mode
      )
        return true;
    } catch {
      return true;
    }
  }
  const extra = (
    await simpleGit(manifest.directory).raw([
      "ls-files",
      "--others",
      "--exclude-standard",
      "-z",
    ])
  )
    .split("\0")
    .filter(Boolean);
  return extra.some(
    (path) =>
      !generatedPaths.includes(path) &&
      !manifest.files.some((file) => file.path === path),
  );
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
