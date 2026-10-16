"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Trace,
  TraceLine,
  TraceIcon,
  TraceTitle,
  TraceCollapsible,
  TraceCollapsibleTrigger,
  TraceCollapsibleContent,
} from "@/components/ui/trace";
import type { AgentMessage } from "../types";
import { getChatPresentation } from "../lib/messages";
import { formatChatDuration, formatChatStep } from "../lib/formatters";
import { AgentActivityStep } from "./agent-activity-step";

const shortResponseCharacterLimit = 160;

type AgentActivityProps = {
  presentation: ReturnType<typeof getChatPresentation>;
  message: AgentMessage;
  busy: boolean;
};

export const AgentActivity = ({
  presentation,
  message,
  busy,
}: AgentActivityProps) => {
  const { activity, answerStarted } = presentation;
  const thinking = busy && !answerStarted;
  // Keep the live height intact for the closing animation; constrain reopened history.
  const [state, setState] = useState({
    thinking,
    open: thinking,
    bounded: !thinking,
  });
  if (state.thinking !== thinking)
    setState({
      thinking,
      open: thinking,
      bounded: thinking ? false : state.bounded,
    });
  if (
    !activity.length &&
    !thinking &&
    presentation.answer.trim().length < shortResponseCharacterLimit
  )
    return null;
  const step = formatChatStep(
    busy && answerStarted ? "response" : "reasoning",
    busy ? "running" : "complete",
  );
  const Icon = step.Icon;
  const label = busy
    ? answerStarted
      ? step.label
      : "Thinking…"
    : message.metadata?.thinkingDurationMs !== undefined
      ? `Worked for ${formatChatDuration(message.metadata.thinkingDurationMs)}`
      : "Thinking history";
  return (
    <Trace>
      <TraceCollapsible
        open={state.open}
        onOpenChange={(open) =>
          setState({ thinking, open, bounded: state.bounded || !thinking })
        }
        className="flex min-w-0 flex-col gap-2 motion-reduce:[&>[data-slot=trace-collapsible-content]]:transition-none"
      >
        {!thinking && (
          <TraceCollapsibleTrigger className="w-full py-2 [&>[data-slot=trace-icon]]:opacity-0 [&>[data-slot=trace-icon]]:transition-opacity hover:[&>[data-slot=trace-icon]]:opacity-100 focus-visible:[&>[data-slot=trace-icon]]:opacity-100">
            <TraceLine status={step.traceStatus} className="flex-1 text-base">
              <TraceIcon>
                <Icon />
              </TraceIcon>
              <TraceTitle>{label}</TraceTitle>
            </TraceLine>
          </TraceCollapsibleTrigger>
        )}
        <TraceCollapsibleContent
          keepMounted
          className="m-0 border-0 p-0 text-base"
        >
          <Trace
            className={cn(
              "scroll-fade gap-3 pb-2",
              state.bounded && "max-h-72 overflow-y-auto overscroll-contain",
            )}
            role="region"
            aria-label="Thinking and tool history"
            tabIndex={0}
          >
            {activity.map((item) => (
              <AgentActivityStep key={item.id} activity={item} />
            ))}
            {!activity.length &&
              (thinking ? (
                <TraceLine status="running" className="text-base">
                  <TraceIcon>
                    <Icon />
                  </TraceIcon>
                  <TraceTitle>Thinking…</TraceTitle>
                </TraceLine>
              ) : (
                <p className="text-base text-muted-foreground">
                  No reasoning or tool details were returned with this response.
                </p>
              ))}
          </Trace>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  );
};
