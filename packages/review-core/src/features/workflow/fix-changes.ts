import { mkdir, rename, rm, writeFile, lstat, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  FixTaskSchema,
  ReviewIdentitySchema,
  TaskChangeSchema,
} from "@senslop/contracts";
import type { LocalStore } from "../../db/local-store";
import { listSourcePaths, readRepository } from "../git/repository";
import { localBytes, blob } from "../git/snapshot";
import { materializeReview, readExecutionManifest } from "./execution-manifest";
import { writeExecutionGitSources } from "./execution-git-sources";
import { FixTasks } from "./fix-tasks";
import { WorkflowStore } from "./workflow-store";
import { readProjectPolicy, allowsSourcePath } from "./project-policy";

export const prepareFixTask = async (
  store: LocalStore,
  root: string,
  task: FixTaskSchema,
  parent: string,
) => {
  const tasks = new FixTasks(store, root);
  try {
    const review = new WorkflowStore(store, root).requireReview(
      task.review.id,
      task.review,
    );
    if (task.workspaceKind === "current") return task;
    const manifest = await materializeReview(store, root, review, parent);
    const latest = tasks.requireTask(task.id);
    return tasks.save({
      ...latest,
      manifestId: manifest.id,
      directory: manifest.directory,
      activity: [
        ...latest.activity,
        {
          label: "Managed worktree prepared",
          createdAt: new Date().toISOString(),
        },
      ],
    });
  } catch (error) {
    const latest = tasks.get(task.id);
    if (latest && latest.status !== "ready") return latest;
    tasks.transition(task.id, "failed", task.review, (error as Error).message);
    throw error;
  }
};

export const captureFixChanges = async (
  store: LocalStore,
  root: string,
  id: string,
  expected: ReviewIdentitySchema,
) => {
  const tasks = new FixTasks(store, root);
  const task = tasks.requireTask(id, expected);
  if (task.status !== "in-progress" || !task.directory)
    throw new Error("Claim and prepare the task before returning changes.");
  const workflow = new WorkflowStore(store, root);
  const review = workflow.round(task.review.id, task.review.round);
  if (!review) throw new Error("Original task source unavailable.");
  const policy = readProjectPolicy(store, root);
  const capturedChanges =
    review.source.kind === "working-tree"
      ? (review.syncBaseline ?? review.files)
      : review.files;
  const base = review.source.head ?? review.source.base;
  const manifest = task.manifestId
    ? readExecutionManifest(store, root, task.manifestId)
    : null;
  const paths = (
    manifest?.files.map((file) => file.path) ??
    (await listSourcePaths(root, base))
  ).filter((path) => allowsSourcePath(policy, path));
  for (const file of capturedChanges)
    if (allowsSourcePath(policy, file.path) && !paths.includes(file.path))
      paths.push(file.path);
  const currentPaths = (await listSourcePaths(task.directory, null)).filter(
    (path) => allowsSourcePath(policy, path),
  );
  const changes: TaskChangeSchema[] = [];
  const requested = new Set(
    workflow
      .findings(review.id)
      .filter((finding) => task.findingIds.includes(finding.id))
      .flatMap((finding) =>
        finding.observations.map((observation) => observation.evidence.path),
      ),
  );
  const originals = new Map(
    (
      manifest?.files ?? (await writeExecutionGitSources(root, base, paths))
    ).map((file) => [file.path, file]),
  );
  for (const path of new Set([...paths, ...currentPaths])) {
    const selected = capturedChanges.find((file) => file.path === path);
    const digest = await localBytes(task.directory, path, 0, true);
    if (digest.unsupported) throw new Error(`${path}: ${digest.unsupported}`);
    const originalMode = originals.get(path)?.mode ?? 0o644;
    if (
      digest.hash &&
      ((await lstat(join(task.directory, path))).mode & 0o777) !==
        (originalMode & 0o777)
    )
      throw new Error(`File mode changes require manual handling: ${path}`);
    const originalHash = manifest
      ? (originals.get(path)?.hash ?? null)
      : selected
        ? selected.afterHash
        : (originals.get(path)?.hash ?? null);
    if ((digest.hash ?? null) === originalHash) continue;
    const existing = await localBytes(task.directory, path, 1024 * 1024);
    if (existing.unsupported)
      throw new Error(`${path}: ${existing.unsupported}`);
    const original = selected
      ? null
      : await blob(root, manifest?.base ?? base, path, 1024 * 1024);
    if (original?.unsupported)
      throw new Error(`${path}: ${original.unsupported}`);
    const before = selected
      ? selected.after
      : (original?.bytes?.toString("utf8") ?? null);
    if (
      existing.bytes?.includes(0) ||
      before?.includes("\0") ||
      selected?.binary
    )
      throw new Error(`Binary changes require manual handling: ${path}`);
    changes.push({
      path,
      before,
      after: existing.bytes?.toString("utf8") ?? null,
      outsideRequestedFiles: !requested.has(path),
    });
  }
  return tasks.transition(
    id,
    "returned",
    expected,
    `Returned ${changes.length} changed files`,
    changes,
  );
};

export const applyFixChanges = async (
  store: LocalStore,
  root: string,
  id: string,
  expected: ReviewIdentitySchema,
  paths: string[],
) => {
  const tasks = new FixTasks(store, root);
  const task = tasks.requireTask(id, expected);
  const review = new WorkflowStore(store, root).requireReview(
    expected.id,
    expected,
  );
  if (task.status !== "returned" || task.workspaceKind !== "managed")
    throw new Error("Choose returned managed changes to apply.");
  if (
    !review.fingerprint ||
    (await readRepository(root)).fingerprint !== review.fingerprint
  )
    throw new Error(
      "Repository changed. Refresh and reassess this fix before applying.",
    );
  const changes = task.changes.filter((change) => paths.includes(change.path));
  if (
    !changes.length ||
    paths.some((path) => !changes.some((change) => change.path === path))
  )
    throw new Error("Choose returned task files.");
  const policy = readProjectPolicy(store, root);
  for (const change of changes) {
    if (!allowsSourcePath(policy, change.path))
      throw new Error("Source policy blocks this change.");
    const current = await localBytes(root, change.path, 1024 * 1024);
    if (
      current.unsupported ||
      (current.bytes?.toString("utf8") ?? null) !== change.before
    )
      throw new Error("Destination changed. No task changes were applied.");
  }
  const modes = new Map<string, number>();
  for (const change of changes)
    modes.set(
      change.path,
      await lstat(join(root, change.path)).then(
        (info) => info.mode & 0o777,
        () => 0o644,
      ),
    );
  const written: TaskChangeSchema[] = [];
  try {
    for (const change of changes) {
      const path = join(root, change.path);
      const current = await localBytes(root, change.path, 1024 * 1024);
      if (
        current.unsupported ||
        (current.bytes?.toString("utf8") ?? null) !== change.before
      )
        throw new Error("Destination changed during application.");
      if (change.after === null) await rm(path);
      else {
        await mkdir(dirname(path), { recursive: true });
        const temporary = `${path}.${randomUUID()}.pending`;
        try {
          await writeFile(temporary, change.after, {
            mode: modes.get(change.path),
          });
          await chmod(temporary, modes.get(change.path)!);
          await rename(temporary, path);
        } finally {
          await rm(temporary, { force: true });
        }
      }
      written.push(change);
    }
  } catch (error) {
    for (const change of written.reverse()) {
      const path = join(root, change.path);
      const current = await localBytes(root, change.path, 1024 * 1024);
      if ((current.bytes?.toString("utf8") ?? null) !== change.after) continue;
      if (change.before === null) await rm(path, { force: true });
      else {
        await writeFile(path, change.before);
        await chmod(path, modes.get(change.path)!);
      }
    }
    throw error;
  }
  return tasks.transition(
    id,
    "reviewed",
    expected,
    `Applied ${changes.length} reviewed files; findings still require verification`,
  );
};
