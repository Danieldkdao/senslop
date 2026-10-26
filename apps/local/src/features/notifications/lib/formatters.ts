import {
  BellRing,
  Boxes,
  Bug,
  CheckCheck,
  ClipboardCheck,
  GitBranch,
  MessageSquare,
  Sparkles,
  PackageCheck,
  Wrench,
} from "lucide-react";
import type { NotificationKind } from "@senslop/contracts";

export const formatNotificationKind = (kind: NotificationKind) => {
  switch (kind) {
    case "grouping":
      return {
        label: "Grouping completed",
        description: "Flows and reading order are ready.",
        Icon: Boxes,
      };
    case "review":
      return {
        label: "Review completed",
        description: "Correctness analysis has finished.",
        Icon: Bug,
      };
    case "checks":
      return {
        label: "Checks passed",
        description: "A selected command completed successfully.",
        Icon: CheckCheck,
      };
    case "verification":
      return {
        label: "Finding verification completed",
        description: "Selected findings have a new assessment.",
        Icon: ClipboardCheck,
      };
    case "fix":
      return {
        label: "Fix ready to inspect",
        description: "An agent has returned changes.",
        Icon: Wrench,
      };
    case "attention":
      return {
        label: "Attention required",
        description: "Background work failed or needs your attention.",
        Icon: BellRing,
      };
    case "chat":
      return {
        label: "Chat response completed",
        description: "A background chat response has finished.",
        Icon: MessageSquare,
      };
    case "explanation":
      return {
        label: "Code explanation completed",
        description: "A selected-code explanation is ready.",
        Icon: Sparkles,
      };
    case "git":
      return {
        label: "Git operation completed",
        description: "A fetch, pull, or push completed.",
        Icon: GitBranch,
      };
    case "updates":
      return {
        label: "Update available",
        description:
          "Show desktop alerts in addition to automatic app update notices.",
        Icon: PackageCheck,
      };
  }
};
