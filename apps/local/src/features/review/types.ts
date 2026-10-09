import type {
  PreviewExcludedSchema,
  PreviewFileSchema,
  PreviewSourceSchema,
} from "@senslop/contracts";
import type { ReviewLineSide } from "./schemas";

export type LivePreview = {
  id: string;
  source: PreviewSourceSchema;
  expectedFiles: number;
  files: PreviewFileSchema[];
  excluded: PreviewExcludedSchema[];
  status: "receiving" | "ready" | "failed";
  error: string | null;
};
export type DiffView = "split" | "unified";

export type DiffSettingsState = {
  indicators: "bars" | "classic" | "none";
  inlineChanges: "word-alt" | "word-line" | "word" | "char" | "none";
  backgrounds: boolean;
  wrapping: boolean;
  lineNumbers: boolean;
};

export type ReviewLine = {
  side: ReviewLineSide;
  lineNumber: number;
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
