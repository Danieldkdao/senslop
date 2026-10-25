import type { LivePreview } from "../../review/types";
import type { ResyncMode } from "@senslop/contracts";
import type { RepositoryState, SavedReviewSummary } from "../types";
import {
  ListTodo,
  ListTree,
  ListX,
  ShieldAlert,
  ShieldCheck,
  ShieldEllipsis,
  ShieldX,
} from "lucide-react";
import { formatJobStatusAppearance } from "../../agents/lib/formatters";

export const formatRepository = (
  repository: RepositoryState | null | undefined,
) =>
  repository
    ? `${repository.branch}, ${repository.head.slice(0, 8)}`
    : "Git metadata unavailable. Check that this repository has a commit, then refresh.";

export const formatReviewDirectory = (directory: string | null) =>
  directory ?? "Folder not recorded";

export const formatReviewSummary = (review: SavedReviewSummary) => ({
  date: new Date(review.createdAt).toLocaleString(),
  round: `Round ${review.round ?? 1}`,
  files: `${review.fileCount} ${review.fileCount === 1 ? "file" : "files"}`,
  notes: `${review.noteCount} ${review.noteCount === 1 ? "note" : "notes"}`,
  completed: `${review.completedCount} complete`,
});

export const formatSnapshot = (hash: string) => `Snapshot ${hash.slice(0, 12)}`;

export const formatReviewWork = (
  job: NonNullable<SavedReviewSummary["work"]>[number],
) => {
  const task = job.kind === "grouping" ? "Grouping" : "Correctness";
  const appearance = {
    ...formatJobStatusAppearance(job.status),
    task: task.toLowerCase(),
  };
  switch (job.status) {
    case "queued":
      return {
        ...appearance,
        Icon: job.kind === "grouping" ? ListTodo : ShieldEllipsis,
        label: `${task}: Queued — ${job.error ?? job.progress}`,
      };
    case "running":
      return {
        ...appearance,
        label: `${task}: Preparing — ${job.progress}`,
      };
    case "completed":
      return {
        ...appearance,
        Icon: job.kind === "grouping" ? ListTree : ShieldCheck,
        label: `${task}: Ready`,
      };
    case "failed":
      return {
        ...appearance,
        Icon: job.kind === "grouping" ? ListX : ShieldAlert,
        label: `${task}: Failed — ${job.error ?? job.progress}`,
      };
    case "canceled":
      return {
        ...appearance,
        Icon: job.kind === "grouping" ? ListX : ShieldX,
        label: `${task}: Canceled`,
      };
  }
};

export const formatFreshness = (
  saved: string | null | undefined,
  current: string | null | undefined,
) => {
  if (!saved || !current) return "Repository freshness unavailable";
  return saved === current
    ? "Repository matches inspection state"
    : "Repository has changed since this inspection. This review remains frozen.";
};

export const formatResyncMode = (mode: ResyncMode) => {
  switch (mode) {
    case "new":
      return "Show only newer edits";
    case "keep":
      return "Keep current changes and add newer edits";
  }
};

export const formatResyncUnavailableReason = ({
  preview,
  repository,
  preparing,
  busy,
  loading,
  failed,
}: {
  preview: LivePreview | null;
  repository: RepositoryState | null | undefined;
  preparing: boolean;
  busy: boolean;
  loading: boolean;
  failed: boolean;
}): string | undefined => {
  if (busy) return "Wait for the current repository operation to finish.";
  if (preparing)
    return "Wait for grouping to finish or stop it before re-syncing.";
  if (loading) return "Checking repository state before re-syncing.";
  if (failed || !repository)
    return "Repository unavailable. Check Git and refresh the repository.";
  if (!preview || preview.status !== "ready")
    return "Wait for the current changes to finish loading before re-syncing.";
  if (preview.source.kind !== "working-tree")
    return "Re-sync is available only for uncommitted-changes reviews. Start a new review.";
  if (!preview.repositoryState)
    return "This review has no captured repository identity. Start a new review.";
  if (
    repository.branch !== preview.repositoryState.branch ||
    repository.head !== preview.repositoryState.head ||
    repository.head !== preview.source.base
  )
    return "The Git branch or HEAD changed. Start a new review for this repository state.";
  if (!preview.fingerprint || !repository.fingerprint)
    return "Repository freshness is unavailable. Refresh the repository and retry.";
  if (preview.fingerprint === repository.fingerprint)
    return "No new changes to re-sync. Edit the repository, then refresh.";
  return undefined;
};
