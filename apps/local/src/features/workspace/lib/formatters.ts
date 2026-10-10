import type { RepositoryState, SavedReviewSummary } from "../types";

export const formatRepository = (
  repository: RepositoryState | null | undefined,
) =>
  repository
    ? `${repository.branch}, ${repository.head.slice(0, 8)}`
    : "Git metadata unavailable. Check that this repository has a commit, then refresh.";

export const formatReviewSummary = (review: SavedReviewSummary) => ({
  date: new Date(review.createdAt).toLocaleString(),
  files: `${review.fileCount} ${review.fileCount === 1 ? "file" : "files"}`,
  notes: `${review.noteCount} ${review.noteCount === 1 ? "note" : "notes"}`,
  completed: `${review.completedCount} complete`,
});

export const formatSnapshot = (hash: string) => `Snapshot ${hash.slice(0, 12)}`;

export const formatFreshness = (
  saved: string | null | undefined,
  current: string | null | undefined,
) => {
  if (!saved || !current) return "Repository freshness unavailable";
  return saved === current
    ? "Repository matches inspection state"
    : "Repository has changed since this inspection. This review remains frozen.";
};
