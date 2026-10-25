import type { JobSchema } from "../agents/schemas";

export type RepositoryState = {
  root: string;
  branch: string;
  head: string;
  fingerprint: string | null;
  branches: string[];
  commits: { id: string; subject: string; date: string }[];
};
export type SavedReviewSummary = {
  work?: Pick<
    JobSchema,
    "id" | "kind" | "status" | "progress" | "error" | "priority"
  >[];
  directory: string | null;
  repository: string;
  round?: number;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  hash: string;
  kind: string;
  fileCount: number;
  noteCount: number;
  completedCount: number;
};
export type WorkspaceMetadata = {
  directory: string;
  root: string;
  repository: RepositoryState | null;
  history: SavedReviewSummary[];
};
