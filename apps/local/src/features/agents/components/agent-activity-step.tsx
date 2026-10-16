"use client";

import {
  TraceLine,
  TraceIcon,
  TraceTitle,
  TraceCollapsible,
  TraceCollapsibleTrigger,
  TraceCollapsibleContent,
} from "@/components/ui/trace";
import type { ChatActivity } from "../types";
import { formatChatDetail, formatChatStep } from "../lib/formatters";
import { AgentMarkdown } from "./agent-markdown";

export const AgentActivityStep = ({ activity }: { activity: ChatActivity }) => {
  const { label, Icon, traceStatus } = formatChatStep(
    activity.toolName ?? activity.kind,
    activity.status,
  );
  return (
    <TraceCollapsible>
      <TraceCollapsibleTrigger className="py-1 [&>[data-slot=trace-icon]]:opacity-0 [&>[data-slot=trace-icon]]:transition-opacity hover:[&>[data-slot=trace-icon]]:opacity-100 focus-visible:[&>[data-slot=trace-icon]]:opacity-100">
        <TraceLine className="text-base" status={traceStatus}>
          <TraceIcon>
            <Icon />
          </TraceIcon>
          <TraceTitle>{label}</TraceTitle>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent className="flex min-w-0 flex-col gap-2 text-base">
        {activity.text && (
          <AgentMarkdown streaming={activity.status === "running"}>
            {activity.text}
          </AgentMarkdown>
        )}
        {activity.input !== undefined && (
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-base font-medium">Request</p>
            <pre className="whitespace-pre-wrap wrap-anywhere text-base">
              {formatChatDetail(activity.input)}
            </pre>
          </div>
        )}
        {activity.output !== undefined && (
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-base font-medium">Result</p>
            <pre className="whitespace-pre-wrap wrap-anywhere text-base">
              {formatChatDetail(activity.output)}
            </pre>
          </div>
        )}
        {activity.error && (
          <p className="wrap-anywhere text-base text-destructive">
            {activity.error}
          </p>
        )}
        {!activity.text &&
          activity.input === undefined &&
          activity.output === undefined &&
          !activity.error && (
            <p className="text-base">
              No additional details were provided for this step.
            </p>
          )}
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
};
