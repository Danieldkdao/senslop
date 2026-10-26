import {
  CircleCheck,
  CircleAlert,
  LoaderCircle,
  CirclePause,
  FileQuestion,
  Bug,
  FlaskConical,
  HelpCircle,
} from "lucide-react";
import type { GitOperationStatus, CoverageIssueKind } from "@senslop/contracts";

export const formatGitOperationStatus = (status: GitOperationStatus) => {
  switch (status) {
    case "running":
      return { label: "Running", Icon: LoaderCircle };
    case "completed":
      return { label: "Completed", Icon: CircleCheck };
    case "failed":
      return { label: "Failed", Icon: CircleAlert };
    case "interrupted":
      return { label: "Interrupted", Icon: CirclePause };
  }
};

export const formatCoverageIssue = (kind: CoverageIssueKind) => {
  switch (kind) {
    case "unreviewed":
      return { label: "Missing review", Icon: FileQuestion };
    case "finding":
      return { label: "Unresolved finding", Icon: Bug };
    case "check":
      return { label: "Missing check", Icon: FlaskConical };
    case "unknown":
      return { label: "Unknown coverage", Icon: HelpCircle };
  }
};

export const formatGitCommitCount = (count: number) =>
  `${count} ${count === 1 ? "commit" : "commits"}`;

export const formatEditorUri = (directory: string, path: string) => {
  const normalized = `${directory.replaceAll("\\", "/").replace(/\/+$/, "")}/${path.replaceAll("\\", "/")}`;
  const absolute = /^[a-z]:\//i.test(normalized)
    ? `/${normalized}`
    : normalized;
  const encoded = absolute
    .split("/")
    .map((part, index) =>
      index === 1 && /^[a-z]:$/i.test(part) ? part : encodeURIComponent(part),
    )
    .join("/");
  return `vscode://file${encoded}`;
};
