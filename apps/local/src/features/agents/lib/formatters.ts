import type { SelectedLineRange } from "@pierre/diffs";
import { formatReviewLineSide } from "../../review/lib/formatters";
import type { UIMessage } from "ai";
import { format, isValid, parseISO } from "date-fns";
import {
  Brain,
  BookOpen,
  Files,
  GitCompare,
  Search,
  Braces,
  Network,
  TestTube,
  ScanLine,
  MessageSquare,
  FileText,
  Link,
  CircleCheck,
  CircleX,
  CircleMinus,
  Clock,
  LoaderCircle,
  type LucideIcon,
} from "lucide-react";
import type { ChatActivity } from "../types";
import type {
  AgentRole,
  GroupingMode,
  FindingSeverity,
  JobStatus,
  JobSchema,
} from "../schemas";

export const formatAgentRole = (role: AgentRole) => {
  switch (role) {
    case "grouping":
      return {
        label: "Grouping",
        description:
          "Organizes changed files into a logical review order and summarizes what changed.",
      };
    case "context":
      return {
        label: "Context",
        description:
          "Retrieves relevant codebase context to help the other models understand your changes.",
      };
    case "review":
      return {
        label: "Review",
        description:
          "Checks your changes for issues, ranks findings by severity, and prepares AI fix prompts.",
      };
    case "explain":
      return {
        label: "Explain",
        description:
          "Explains selected code and changes using relevant codebase context.",
      };
  }
};

export const formatSeverity = (severity: FindingSeverity) => {
  switch (severity) {
    case "critical":
      return {
        label: "Critical",
        className: "text-finding-critical/85",
        cardClassName:
          "border-finding-critical/20 bg-finding-critical-surface/15",
      };
    case "high":
      return {
        label: "High",
        className: "text-finding-high/85",
        cardClassName: "border-finding-high/20 bg-finding-high-surface/15",
      };
    case "medium":
      return {
        label: "Medium",
        className: "text-finding-medium/85",
        cardClassName: "border-finding-medium/20 bg-finding-medium-surface/15",
      };
    case "low":
      return {
        label: "Low",
        className: "text-finding-low/85",
        cardClassName: "border-finding-low/20 bg-finding-low-surface/15",
      };
    case "informational":
      return {
        label: "Informational",
        className: "text-muted-foreground",
        cardClassName: "border-border bg-card",
      };
  }
};

export const formatJobStatusAppearance = (status: JobStatus) => {
  switch (status) {
    case "completed":
      return { Icon: CircleCheck, className: "text-success!", loading: false };
    case "failed":
      return { Icon: CircleX, className: "text-destructive!", loading: false };
    case "running":
      return {
        Icon: LoaderCircle,
        className: "text-muted-foreground!",
        loading: true,
      };
    case "queued":
      return {
        Icon: Clock,
        className: "text-muted-foreground!",
        loading: false,
      };
    case "canceled":
      return {
        Icon: CircleMinus,
        className: "text-muted-foreground!",
        loading: false,
      };
  }
};

export const formatJobStatus = (status: JobStatus) => {
  switch (status) {
    case "queued":
      return "Waiting for local worker";
    case "running":
      return "Analyzing changes";
    case "completed":
      return "Complete";
    case "failed":
      return "Failed — retry available";
    case "canceled":
      return "Canceled";
  }
};

export const formatRunDate = (date: string) => new Date(date).toLocaleString();

export const formatReviewName = (job: JobSchema) =>
  job.title ?? formatRunDate(job.createdAt);

export const formatJobModel = (job: JobSchema) =>
  (job.settings.separate ? job.settings.roles[job.kind] : job.settings.shared)
    ?.name ?? "Unavailable model";

export const formatMessageText = (message: Pick<UIMessage, "parts">) =>
  message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");

export const formatChatDate = (value: string) => {
  const date = parseISO(value);
  return isValid(date) ? format(date, "MMM d, yyyy 'at' h:mm a") : "";
};

export const formatChatDuration = (milliseconds: number) => {
  const seconds = Math.max(1, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [
    hours ? `${hours}h` : null,
    minutes ? `${minutes}m` : null,
    remainder ? `${remainder}s` : null,
  ]
    .filter(Boolean)
    .join(" ");
};

export const formatChatStep = (
  name: string,
  status: ChatActivity["status"],
) => {
  const running = status === "running";
  let label: string;
  let Icon: LucideIcon;
  switch (name) {
    case "reasoning":
      label = running ? "Thinking…" : "Finished thinking";
      Icon = Brain;
      break;
    case "listFiles":
      label = running ? "Listing files" : "Listed files";
      Icon = Files;
      break;
    case "readSource":
      label = running ? "Reading source" : "Read source";
      Icon = BookOpen;
      break;
    case "readDiff":
      label = running ? "Reading changes" : "Read changes";
      Icon = GitCompare;
      break;
    case "searchSource":
      label = running ? "Searching source" : "Searched source";
      Icon = Search;
      break;
    case "lookupSymbols":
      label = running ? "Looking up symbols" : "Found symbols";
      Icon = Braces;
      break;
    case "references":
      label = running ? "Finding references" : "Found references";
      Icon = Network;
      break;
    case "dependencies":
      label = running ? "Checking dependencies" : "Checked dependencies";
      Icon = Network;
      break;
    case "relatedTests":
      label = running ? "Finding related tests" : "Found related tests";
      Icon = TestTube;
      break;
    case "diagnostics":
      label = running ? "Checking diagnostics" : "Checked diagnostics";
      Icon = ScanLine;
      break;
    case "askContext":
      label = running ? "Reading context" : "Read context";
      Icon = BookOpen;
      break;
    case "text":
      label = "Agent update";
      Icon = MessageSquare;
      break;
    case "response":
      label = running ? "Writing response…" : "Response";
      Icon = MessageSquare;
      break;
    case "source":
      label = "Source";
      Icon = Link;
      break;
    default:
      label = running ? `Running ${name}` : `Finished ${name}`;
      Icon = FileText;
  }
  return {
    label: status === "failed" ? `${label} — failed` : label,
    Icon,
    className:
      status === "failed" ? "text-destructive" : "text-muted-foreground",
    traceStatus:
      status === "failed"
        ? ("error" as const)
        : status === "running"
          ? ("running" as const)
          : undefined,
  };
};

export const formatChatDetail = (value: unknown) => {
  if (value === undefined) return "";
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > 8000
    ? `${text.slice(0, 8000)}\n…Additional data omitted from this preview.`
    : text;
};

export const formatGroupingMode = (mode: GroupingMode) => {
  switch (mode) {
    case "always":
      return {
        label: "Always group and summarize",
        description:
          "Wait for AI to organize files and write summaries before each review opens.",
      };
    case "never":
      return {
        label: "No grouping or summarization",
        description:
          "Open changes immediately in their original file order, without AI summaries.",
      };
    case "ask":
      return {
        label: "Decide each review",
        description:
          "Choose in New review. Grouped reviews wait for AI preparation before opening.",
      };
  }
};

export const formatExplanationRange = (range: SelectedLineRange) => {
  const start = Math.min(range.start, range.end);
  const end = Math.max(range.start, range.end);
  const side = formatReviewLineSide(range.side ?? "additions");
  return start === end
    ? `${side} line ${start}`
    : `${side} lines ${start}–${end}`;
};

export const formatGroupingCountdown = (seconds: number, fallback: boolean) => {
  if (!fallback && seconds === 0)
    return "Waiting for the local worker to retry grouping…";
  const duration = `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
  return fallback
    ? `Opening the file review in ${duration}.`
    : `Retrying grouping in ${duration}.`;
};

export const formatJobProgress = (progress: string) => {
  const repair =
    /^Repairing (review|grouping|ordering) defects: ([\s\S]*)$/.exec(progress);
  const details = repair
    ? [...new Set(repair[2]!.split(", ").filter(Boolean))]
    : [];
  switch (repair?.[1]) {
    case "review":
      return {
        label: `Validating findings (${details.length} files)`,
        details,
        detailsLabel: "Files being checked",
        Icon: ScanLine,
      };
    case "grouping":
      return {
        label: "Refining file groups",
        details,
        detailsLabel: "Analysis details",
        Icon: Files,
      };
    case "ordering":
      return {
        label: "Refining reading order",
        details,
        detailsLabel: "Analysis details",
        Icon: BookOpen,
      };
    default:
      return {
        label: progress,
        details,
        detailsLabel: "Analysis details",
        Icon: LoaderCircle,
      };
  }
};
