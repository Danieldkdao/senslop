import { z } from "zod";
import type { LocalStore } from "@senslop/review-core/storage";
import { WorkflowStore } from "@senslop/review-core/workflow";
import { FixTasks } from "@senslop/review-core/fix-tasks";
import { CheckRunner } from "@senslop/review-core/checks";
import { VerificationStore } from "@senslop/review-core/verification";
import type { WorkflowHistoryKind } from "../schemas";

const hiddenHistorySchema = z.array(z.uuid());
export type HiddenHistorySchema = z.infer<typeof hiddenHistorySchema>;

export const hiddenWorkflowHistory = (
  store: LocalStore,
  reviewId: string,
  kind: WorkflowHistoryKind,
) => {
  const row = store.database
    .prepare("SELECT value FROM preferences WHERE name=?")
    .get(`workflow-history:${reviewId}:${kind}`);
  return new Set(
    hiddenHistorySchema.parse(row ? JSON.parse(String(row.value)) : []),
  );
};

export const removeWorkflowHistory = (
  store: LocalStore,
  repository: string,
  reviewId: string,
  kind: WorkflowHistoryKind,
  id?: string,
) =>
  store.transaction(() => {
    new WorkflowStore(store, repository).requireReview(reviewId);
    const items = (() => {
      switch (kind) {
        case "tasks":
          return new FixTasks(store, repository).list(reviewId);
        case "checks":
          return new CheckRunner(store, repository, "").list(reviewId);
        case "verification":
          return new VerificationStore(store, repository).list(reviewId);
      }
    })();
    const hidden = hiddenWorkflowHistory(store, reviewId, kind);
    if (id && !items.some((item) => item.id === id))
      throw new Error("History item not found in this review.");
    const active = (status: string) =>
      ["queued", "running", "ready", "in-progress", "returned"].includes(
        status,
      );
    if (id && items.some((item) => item.id === id && active(item.status)))
      throw new Error(
        "Finish or cancel this item before removing it from history.",
      );
    const removed = items.filter(
      (item) =>
        (!id || item.id === id) && !active(item.status) && !hidden.has(item.id),
    );
    for (const item of removed) hidden.add(item.id);
    // Keep immutable execution and verification evidence available to linked findings and reports.
    store.database
      .prepare(
        "INSERT INTO preferences VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value",
      )
      .run(`workflow-history:${reviewId}:${kind}`, JSON.stringify([...hidden]));
    return { removed: removed.length };
  });
