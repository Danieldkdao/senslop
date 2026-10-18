import type { JobSchema } from "../../agents/schemas";
import type { PreviewSourceKind } from "@senslop/contracts";
import type {
  DiffSettingsState,
  DiffTheme,
  DiffFont,
  LivePreview,
  ReviewLine,
  ReviewOperation,
} from "../types";
import type { ReviewLineSide } from "../schemas";

export const formatDiffTheme = (theme: DiffTheme) => {
  switch (theme) {
    case "default":
      return "Default";
    case "github-light":
      return "GitHub Light";
    case "github-light-default":
      return "GitHub Light Default";
    case "catppuccin-latte":
      return "Catppuccin Latte";
    case "one-light":
      return "One Light";
    case "solarized-light":
      return "Solarized Light";
    case "rose-pine-dawn":
      return "Rosé Pine Dawn";
    case "vitesse-light":
      return "Vitesse Light";
    case "min-light":
      return "Min Light";
    case "snazzy-light":
      return "Snazzy Light";
    case "slack-ochin":
      return "Slack Ochin";
    case "github-dark":
      return "GitHub Dark";
    case "dracula":
      return "Dracula";
    case "one-dark-pro":
      return "One Dark Pro";
    case "nord":
      return "Nord";
    case "tokyo-night":
      return "Tokyo Night";
    case "catppuccin-mocha":
      return "Catppuccin Mocha";
    case "monokai":
      return "Monokai";
    case "night-owl":
      return "Night Owl";
    case "solarized-dark":
      return "Solarized Dark";
    case "rose-pine":
      return "Rosé Pine";
  }
};

export const formatDiffFont = (font: DiffFont) => {
  switch (font) {
    // An open tab can retain a retired font across a code update.
    default:
    case "jetbrains-mono":
      return {
        label: "JetBrains Mono (Default)",
        fontFamily: 'var(--font-mono), "JetBrains Mono", monospace',
      };
    case "geist-mono":
      return {
        label: "Geist Mono",
        fontFamily: 'var(--font-geist-mono), "Geist Mono", monospace',
      };
    case "fira-code":
      return {
        label: "Fira Code",
        fontFamily: 'var(--font-fira-code), "Fira Code", monospace',
      };
    case "ibm-plex-mono":
      return {
        label: "IBM Plex Mono",
        fontFamily: 'var(--font-ibm-plex-mono), "IBM Plex Mono", monospace',
      };
    case "cascadia-code":
      return {
        label: "Cascadia Code",
        fontFamily: 'var(--font-cascadia-code), "Cascadia Code", monospace',
      };
  }
};

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
