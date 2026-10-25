import { executionManifestSchema, checkRunSchema } from "@senslop/contracts";
import type { LocalStore } from "../../db/local-store";
import { WorkflowStore } from "./workflow-store";
import { readProjectPolicy } from "./project-policy";
import { removeManagedWorkspace } from "./execution-manifest";

export const projectManifests = (store: LocalStore, repository: string) =>
  store.database
    .prepare(
      "SELECT m.body FROM execution_manifests m JOIN reviews r ON r.id=m.review_id WHERE r.repository=? ORDER BY m.rowid DESC",
    )
    .all(repository)
    .map((row) => executionManifestSchema.parse(JSON.parse(String(row.body))));

export const deleteReviewData = async (
  store: LocalStore,
  repository: string,
  id: string,
  expected?: { hash: string; round: number },
) => {
  new WorkflowStore(store, repository).requireReview(id, expected);
  const active = store.database
    .prepare(
      "SELECT 1 FROM fix_tasks WHERE review_id=? AND json_extract(body,'$.status') IN ('ready','in-progress','returned') UNION SELECT 1 FROM check_runs WHERE review_id=? AND (json_extract(body,'$.status') IN ('queued','running') OR json_extract(body,'$.ownerPid') IS NOT NULL) UNION SELECT 1 FROM finding_verifications WHERE review_id=? AND json_extract(body,'$.status') IN ('queued','running')",
    )
    .get(id, id, id);
  if (active)
    throw new Error(
      "Review has active tasks, checks, or verification. Cancel them and wait for execution to stop before deleting.",
    );
  for (const manifest of projectManifests(store, repository).filter(
    (item) => item.review.id === id && !item.removedAt,
  ))
    await removeManagedWorkspace(store, repository, manifest.id);
  store.deleteReview(repository, id, expected);
};

export const maintainProjectData = async (
  store: LocalStore,
  repository: string,
  now = Date.now(),
) => {
  const policy = readProjectPolicy(store, repository);
  for (const row of store.database
    .prepare(
      "SELECT c.id,c.body FROM check_runs c JOIN reviews r ON r.id=c.review_id WHERE r.repository=?",
    )
    .all(repository)) {
    const check = checkRunSchema.parse(JSON.parse(String(row.body)));
    if (
      policy.logRetentionDays !== null &&
      !["queued", "running"].includes(check.status) &&
      now - Date.parse(check.updatedAt) > policy.logRetentionDays * 86400000 &&
      !check.logExpired
    ) {
      store.database.prepare("UPDATE check_runs SET body=? WHERE id=?").run(
        JSON.stringify({
          ...check,
          output: "Output expired under the project's log retention policy.",
          logExpired: true,
        }),
        check.id,
      );
    }
  }
  for (const manifest of projectManifests(store, repository)) {
    if (
      manifest.removedAt ||
      now - Date.parse(manifest.createdAt) <
        policy.workspaceRetentionDays * 86400000
    )
      continue;
    // Retention never discards newer agent edits or interrupts an active task.
    await removeManagedWorkspace(store, repository, manifest.id).catch(
      () => {},
    );
  }
  if (policy.historyRetentionDays !== null)
    for (const review of store.listReviews(repository))
      if (
        now - Date.parse(review.updatedAt) >
        policy.historyRetentionDays * 86400000
      )
        await deleteReviewData(store, repository, review.id).catch(() => {});
};
