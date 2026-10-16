import type {
  PreviewExcludedSchema,
  PreviewFileSchema,
  PreviewSourceSchema,
  SavedReviewSchema,
} from "@senslop/contracts";
import type { ReviewLineSide } from "./schemas";
import type {
  diffThemeValues,
  diffViews,
  diffIndicators,
  inlineChangeStyles,
  diffFonts,
} from "./constants";

export type LivePreview = Partial<SavedReviewSchema> & {
  id: string;
  source: PreviewSourceSchema;
  expectedFiles: number;
  files: PreviewFileSchema[];
  excluded: PreviewExcludedSchema[];
  status: "receiving" | "ready" | "failed";
  error: string | null;
};
export type ReviewOperation = {
  snapshotId: string;
  hash: string;
  mode: "inspect" | "new" | "keep";
};

export type DiffView = (typeof diffViews)[number];
export type DiffTheme = (typeof diffThemeValues)[number];
export type DiffFont = (typeof diffFonts)[number];
export type DiffIndicator = (typeof diffIndicators)[number];
export type InlineChangeStyle = (typeof inlineChangeStyles)[number];

export type DiffSettingsState = {
  theme: DiffTheme;
  font: DiffFont;
  fontSize: number;
  lineHeight: number;
  indicators: DiffIndicator;
  inlineChanges: InlineChangeStyle;
  backgrounds: boolean;
  wrapping: boolean;
  lineNumbers: boolean;
};

export type ReviewLine = {
  side: ReviewLineSide;
  lineNumber: number;
  endLineNumber?: number;
  code: string;
};

export type ReviewNote = {
  id: string;
  previewId: string;
  path: string;
  body: string;
  line: ReviewLine | null;
};

export type ReviewAnnotation =
  { kind: "comment"; note: ReviewNote } | { kind: "composer" };
