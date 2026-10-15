import type { JobSchema } from "../../agents/schemas";
import type { PreviewSourceKind } from "@senslop/contracts";
import type {
  DiffSettingsState,
  LivePreview,
  ReviewLine,
  ReviewOperation,
} from "../types";
import type { ReviewLineSide } from "../schemas";

export const formatPreviewSource = (kind: PreviewSourceKind) => {
  switch (kind) {
    case "working-tree":
      return "Uncommitted changes";
    case "commit":
      return "Single commit";
    case "range":
      return "Commit range";
    case "branch":
      return "Branch comparison";
  }
};

export const formatFileStatus = (status: string) => {
  switch (status[0]) {
    case "A":
      return "Added";
    case "D":
      return "Deleted";
    case "R":
      return "Renamed";
    case "C":
      return "Copied";
    case "T":
      return "Type changed";
    case "U":
      return "Unmerged";
    case "M":
      return "Modified";
    default:
      return "Changed";
  }
};

export const formatPreviewProgress = (preview: LivePreview) => {
  switch (preview.status) {
    case "receiving":
      return `Receiving ${preview.files.length} of ${preview.expectedFiles} files`;
    case "ready":
      return `${preview.files.length} files ready`;
    case "failed":
      return "Preview interrupted";
  }
};

export const formatDiffIndicator = (
  indicator: DiffSettingsState["indicators"],
) => {
  switch (indicator) {
    case "bars":
      return "Bars";
    case "classic":
      return "Classic";
    case "none":
      return "None";
  }
};

export const formatInlineChangeStyle = (
  style: DiffSettingsState["inlineChanges"],
) => {
  switch (style) {
    case "word-alt":
      return "Word-alt";
    case "word-line":
      return "Word-line";
    case "word":
      return "Word";
    case "char":
      return "Character";
    case "none":
      return "None";
  }
};

export const formatReviewLineSide = (side: ReviewLineSide) => {
  switch (side) {
    case "additions":
      return "New";
    case "deletions":
      return "Old";
  }
};

export const formatReviewLine = (line: ReviewLine) =>
  line.endLineNumber && line.endLineNumber !== line.lineNumber
    ? `${formatReviewLineSide(line.side)} Lines ${line.lineNumber}-${line.endLineNumber}`
    : `${formatReviewLineSide(line.side)} line ${line.lineNumber}`;

export const formatFileReviewLabel = (path: string, completed: boolean) =>
  completed ? `${path}: Completed` : path;

export const formatAnalysisNotification = (job: JobSchema) => {
  const label = job.kind === "grouping" ? "Grouping" : "Review analysis";
  switch (job.status) {
    case "completed":
      return job.kind === "grouping"
        ? "Grouping finished. Your changes are ready to explore."
        : "Review analysis finished.";
    case "failed":
      return `${label} failed: ${job.error ?? "Retry when ready."}`;
    case "queued":
    case "running":
    case "canceled":
      return null;
  }
};

export const formatReviewOperation = (mode: ReviewOperation["mode"]) => {
  switch (mode) {
    case "keep":
      return "Review updated with the latest changes.";
    case "new":
      return "Re-sync finished. Your new changes are ready to explore.";
    case "inspect":
      return "Your changes are ready to explore.";
  }
};
