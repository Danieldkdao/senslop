import {
  Circle,
  Cloud,
  Zap,
  ScanSearch,
  FolderGit2,
  Pencil,
  HardDrive,
  CircleCheck,
  CircleCheckBig,
  CircleHelp,
  CircleMinus,
  CircleX,
  Clock,
  Eye,
  GitPullRequestClosed,
  Handshake,
  LoaderCircle,
  ShieldQuestion,
  SquareCheck,
  TimerOff,
  Unplug,
  Wrench,
  History,
  Link2,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import type {
  FindingDecision,
  VerificationOutcome,
  FixTaskStatus,
  CheckStatus,
  WorkflowJobStatus,
  FindingEventSchema,
} from "@senslop/contracts";
import {
  findingDecisions,
  verificationOutcomes,
  fixTaskStatuses,
} from "@senslop/contracts";

export const formatFindingDecision = (
  status: FindingDecision,
): { label: string; Icon: LucideIcon } => {
  switch (status) {
    case "open":
      return { label: "Open", Icon: Circle };
    case "accepted":
      return { label: "Accepted", Icon: Handshake };
    case "dismissed":
      return { label: "Dismissed", Icon: CircleMinus };
    case "resolved":
      return { label: "Resolved", Icon: CircleCheckBig };
  }
};
export const formatVerificationOutcome = (status: VerificationOutcome) => {
  switch (status) {
    case "present":
      return { label: "Still present", Icon: Eye };
    case "apparently-fixed":
      return { label: "Apparently fixed", Icon: CircleCheck };
    case "not-applicable":
      return { label: "No longer applicable", Icon: GitPullRequestClosed };
    case "unverified":
      return { label: "Unverified", Icon: ShieldQuestion };
  }
};
export const formatFixTaskStatus = (status: FixTaskStatus) => {
  switch (status) {
    case "ready":
      return { label: "Ready", Icon: Clock };
    case "in-progress":
      return { label: "In progress", Icon: Wrench };
    case "returned":
      return { label: "Changes returned", Icon: Eye };
    case "reviewed":
      return { label: "Reviewed", Icon: SquareCheck };
    case "failed":
      return { label: "Failed", Icon: CircleX };
    case "canceled":
      return { label: "Canceled", Icon: CircleMinus };
  }
};

export const formatFindingActivity = (event: FindingEventSchema) => {
  switch (event.kind) {
    case "decision": {
      const decision = findingDecisions.find((value) => value === event.label);
      return decision
        ? formatFindingDecision(decision)
        : { label: event.label, Icon: Pencil };
    }
    case "assessment": {
      const outcome = verificationOutcomes.find(
        (value) => value === event.label,
      );
      return outcome
        ? formatVerificationOutcome(outcome)
        : { label: event.label, Icon: ScanSearch };
    }
    case "duplicate":
      return { label: event.label, Icon: Link2 };
    case "recurrence":
      return { label: event.label, Icon: RotateCcw };
  }
};

export const formatTaskActivity = (label: string) => {
  const status = fixTaskStatuses.find((value) => value === label);
  return status ? formatFixTaskStatus(status) : { label, Icon: History };
};

export const formatCheckStatus = (status: CheckStatus) => {
  switch (status) {
    case "queued":
      return { label: "Queued", Icon: Clock, loading: false };
    case "running":
      return { label: "Running", Icon: LoaderCircle, loading: true };
    case "passed":
      return { label: "Passed", Icon: CircleCheck, loading: false };
    case "failed":
      return { label: "Failed", Icon: CircleX, loading: false };
    case "blocked":
      return { label: "Blocked", Icon: CircleHelp, loading: false };
    case "canceled":
      return { label: "Canceled", Icon: CircleMinus, loading: false };
    case "timed-out":
      return { label: "Timed out", Icon: TimerOff, loading: false };
    case "interrupted":
      return { label: "Interrupted", Icon: Unplug, loading: false };
  }
};
export const formatFindingCategory = (category: string) => {
  switch (category) {
    case "correctness":
      return "Correctness";
    case "security":
      return "Security";
    case "performance":
      return "Performance";
    case "reliability":
      return "Reliability";
    default:
      return "Uncategorized";
  }
};

export const formatUsageNumber = (value: number) =>
  new Intl.NumberFormat(undefined, {
    notation: value >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
export const formatUsageDuration = (milliseconds: number) =>
  `${formatUsageNumber(milliseconds / 1000)} s`;
export const formatUsageCost = (value: number | null) =>
  value === null
    ? "Unknown"
    : new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 4,
      }).format(value);
export const formatActivityTime = (value: string) =>
  new Date(value).toLocaleString();
export const formatUsageMetric = (metric: string) => {
  switch (metric) {
    case "inputTokens":
      return "Input tokens";
    case "outputTokens":
      return "Output tokens";
    case "durationMs":
      return "Duration in ms";
    case "grouping":
      return "Grouping";
    case "review":
      return "Correctness";
    case "verification":
      return "Verification";
    case "context":
      return "Context";
    case "chat":
      return "Chat";
    case "explain":
      return "Explanation";
    default:
      return metric;
  }
};

export const formatWorkflowJobStatus = (status: WorkflowJobStatus) => {
  switch (status) {
    case "queued":
      return { label: "Queued", Icon: Clock, loading: false };
    case "running":
      return { label: "Running", Icon: LoaderCircle, loading: true };
    case "completed":
      return { label: "Completed", Icon: CircleCheck, loading: false };
    case "failed":
      return { label: "Failed", Icon: CircleX, loading: false };
    case "canceled":
      return { label: "Canceled", Icon: CircleMinus, loading: false };
  }
};

export const formatCheckComparison = (
  comparison: import("./compare-checks").CheckComparison,
) => {
  switch (comparison) {
    case "pending":
      return { label: "Waiting for base comparison", Icon: Clock };
    case "unavailable":
      return { label: "Base comparison unavailable", Icon: CircleHelp };
    case "pre-existing-failure":
      return {
        label: "Both revisions fail; inspect output for the same failure",
        Icon: Eye,
      };
    case "regression":
      return {
        label: "Potential regression: base passed, changed source failed",
        Icon: CircleX,
      };
    case "improved":
      return { label: "Changed source passed; base failed", Icon: CircleCheck };
    case "passed":
      return { label: "Both revisions passed", Icon: CircleCheckBig };
  }
};

export const formatModelRoute = (local: boolean | null) => {
  switch (local) {
    case true:
      return { label: "Local endpoint", Icon: HardDrive };
    case false:
      return { label: "Remote inference", Icon: Cloud };
    case null:
      return { label: "Unassigned model", Icon: CircleHelp };
  }
};

export const formatAnalysisMode = (
  mode: import("@senslop/contracts").AnalysisMode,
) => {
  switch (mode) {
    case "quick":
      return {
        label: "Quick",
        Icon: Zap,
        description:
          "Quick skips delegated context calls; captured-source tools remain available.",
      };
    case "thorough":
      return {
        label: "Thorough",
        Icon: ScanSearch,
        description:
          "Thorough can consult a context agent when one is configured.",
      };
  }
};
export const formatInferencePolicy = (
  policy: import("@senslop/contracts").InferencePolicy,
) => {
  switch (policy) {
    case "local-only":
      return { label: "Local inference only", Icon: HardDrive };
    case "configured":
      return { label: "Configured providers", Icon: Cloud };
  }
};
export const formatWorkspaceKind = (
  kind: import("@senslop/contracts").WorkspaceKind,
) => {
  switch (kind) {
    case "managed":
      return { label: "Managed worktree", Icon: FolderGit2 };
    case "current":
      return { label: "Current worktree", Icon: Pencil };
  }
};
