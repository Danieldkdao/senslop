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
): { label: string; Icon: LucideIcon; loading: boolean } => {
  switch (status) {
    case "open":
      return { loading: false, label: "Open", Icon: Circle };
    case "accepted":
      return { loading: false, label: "Accepted", Icon: Handshake };
    case "dismissed":
      return { loading: false, label: "Dismissed", Icon: CircleMinus };
    case "resolved":
      return { loading: false, label: "Resolved", Icon: CircleCheckBig };
  }
};
export const formatVerificationOutcome = (status: VerificationOutcome) => {
  switch (status) {
    case "present":
      return { loading: false, label: "Still present", Icon: Eye };
    case "apparently-fixed":
      return { loading: false, label: "Apparently fixed", Icon: CircleCheck };
    case "not-applicable":
      return {
        loading: false,
        label: "No longer applicable",
        Icon: GitPullRequestClosed,
      };
    case "unverified":
      return { loading: false, label: "Unverified", Icon: ShieldQuestion };
  }
};
export const formatVerificationNextStep = (outcome: VerificationOutcome) => {
  switch (outcome) {
    case "present":
      return "The reported issue remains; inspect the evidence and create a fix task.";
    case "apparently-fixed":
      return "Source suggests a fix; run a targeted check before resolving the finding.";
    case "not-applicable":
      return "The failure condition no longer applies; inspect the evidence before dismissing it.";
    case "unverified":
      return "The evidence is inconclusive; inspect the source or run a targeted check.";
  }
};

export const formatFixTaskStatus = (status: FixTaskStatus) => {
  switch (status) {
    case "ready":
      return { loading: false, label: "Ready", Icon: Clock };
    case "in-progress":
      return { loading: true, label: "In progress", Icon: LoaderCircle };
    case "returned":
      return { loading: false, label: "Changes returned", Icon: Eye };
    case "reviewed":
      return { loading: false, label: "Reviewed", Icon: SquareCheck };
    case "failed":
      return { loading: false, label: "Failed", Icon: CircleX };
    case "canceled":
      return { loading: false, label: "Canceled", Icon: CircleMinus };
  }
};

export const formatFindingActivity = (event: FindingEventSchema) => {
  switch (event.kind) {
    case "decision": {
      const decision = findingDecisions.find((value) => value === event.label);
      return decision
        ? formatFindingDecision(decision)
        : { loading: false, label: event.label, Icon: Pencil };
    }
    case "assessment": {
      const outcome = verificationOutcomes.find(
        (value) => value === event.label,
      );
      return outcome
        ? formatVerificationOutcome(outcome)
        : { loading: false, label: event.label, Icon: ScanSearch };
    }
    case "duplicate":
      return { loading: false, label: event.label, Icon: Link2 };
    case "recurrence":
      return { loading: false, label: event.label, Icon: RotateCcw };
  }
};

export const formatTaskActivity = (label: string) => {
  const status = fixTaskStatuses.find((value) => value === label);
  return status
    ? formatFixTaskStatus(status)
    : { loading: false, label, Icon: History };
};

export const formatCheckStatus = (status: CheckStatus) => {
  switch (status) {
    case "queued":
      return {
        className: "text-muted-foreground",
        label: "Queued",
        Icon: Clock,
        loading: false,
      };
    case "running":
      return {
        className: "text-primary",
        label: "Running",
        Icon: LoaderCircle,
        loading: true,
      };
    case "passed":
      return {
        className: "text-success",
        label: "Passed",
        Icon: CircleCheck,
        loading: false,
      };
    case "failed":
      return {
        className: "text-destructive",
        label: "Failed",
        Icon: CircleX,
        loading: false,
      };
    case "blocked":
      return {
        className: "text-destructive",
        label: "Blocked",
        Icon: CircleHelp,
        loading: false,
      };
    case "canceled":
      return {
        className: "text-muted-foreground",
        label: "Canceled",
        Icon: CircleMinus,
        loading: false,
      };
    case "timed-out":
      return {
        className: "text-destructive",
        label: "Timed out",
        Icon: TimerOff,
        loading: false,
      };
    case "interrupted":
      return {
        className: "text-destructive",
        label: "Interrupted",
        Icon: Unplug,
        loading: false,
      };
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
      return {
        loading: false,
        label: "Waiting for base comparison",
        Icon: Clock,
      };
    case "unavailable":
      return {
        loading: false,
        label: "Base comparison unavailable",
        Icon: CircleHelp,
      };
    case "pre-existing-failure":
      return {
        loading: false,
        label: "Both revisions fail; inspect output for the same failure",
        Icon: Eye,
      };
    case "regression":
      return {
        loading: false,
        label: "Potential regression: base passed, changed source failed",
        Icon: CircleX,
      };
    case "improved":
      return {
        loading: false,
        label: "Changed source passed; base failed",
        Icon: CircleCheck,
      };
    case "passed":
      return {
        loading: false,
        label: "Both revisions passed",
        Icon: CircleCheckBig,
      };
  }
};

export const formatModelRoute = (local: boolean | null) => {
  switch (local) {
    case true:
      return { loading: false, label: "Local endpoint", Icon: HardDrive };
    case false:
      return { loading: false, label: "Remote inference", Icon: Cloud };
    case null:
      return { loading: false, label: "Unassigned model", Icon: CircleHelp };
  }
};

export const formatAnalysisMode = (
  mode: import("@senslop/contracts").AnalysisMode,
) => {
  switch (mode) {
    case "quick":
      return {
        loading: false,
        label: "Quick",
        Icon: Zap,
        description:
          "Quick skips delegated context calls; captured-source tools remain available.",
      };
    case "thorough":
      return {
        loading: false,
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
      return { loading: false, label: "Local inference only", Icon: HardDrive };
    case "configured":
      return { loading: false, label: "Configured providers", Icon: Cloud };
  }
};
export const formatWorkspaceKind = (
  kind: import("@senslop/contracts").WorkspaceKind,
) => {
  switch (kind) {
    case "managed":
      return { loading: false, label: "Managed worktree", Icon: FolderGit2 };
    case "current":
      return { loading: false, label: "Current worktree", Icon: Pencil };
  }
};
