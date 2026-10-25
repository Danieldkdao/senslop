"use client";

import { StopCircle } from "lucide-react";
import type { VerificationRunSchema } from "@senslop/contracts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  formatWorkflowJobStatus,
  formatVerificationOutcome,
  formatActivityTime,
} from "../lib/formatters";
import type { WorkflowActionSchema } from "../schemas";

export const VerificationResults = ({
  runs,
  onAction,
}: {
  runs: VerificationRunSchema[];
  onAction: (action: WorkflowActionSchema) => Promise<unknown>;
}) => (
  <div className="flex flex-col">
    {!runs.length && (
      <span className="text-muted-foreground">
        Select findings in Review, then use Verify to assess this round.
      </span>
    )}
    {runs.map((run) => {
      const status = formatWorkflowJobStatus(run.status);
      return (
        <Collapsible
          key={run.id}
          className="flex min-w-0 flex-col gap-3 border-b py-3"
        >
          <div className="flex items-center gap-2">
            <TooltipWrapper content={status.label}>
              <span tabIndex={0} role="status" aria-label={status.label}>
                <status.Icon
                  aria-hidden="true"
                  className={cn(
                    "size-5 text-muted-foreground",
                    status.loading && "animate-spin",
                  )}
                />
              </span>
            </TooltipWrapper>
            <CollapsibleTrigger className="min-w-0 flex-1 text-left text-base">
              Round {run.review.round}, {run.assessments.length}/
              {run.findingIds.length} assessed
            </CollapsibleTrigger>
            {["queued", "running"].includes(run.status) && (
              <TooltipWrapper content="Cancel verification">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Cancel verification"
                  onClick={() =>
                    void onAction({
                      action: "cancel-verification",
                      verificationId: run.id,
                    }).catch(() => {})
                  }
                >
                  <StopCircle aria-hidden="true" className="size-4" />
                </Button>
              </TooltipWrapper>
            )}
          </div>
          <CollapsibleContent>
            <div className="flex flex-col gap-3 text-base">
              <time dateTime={run.createdAt} className="text-muted-foreground">
                {formatActivityTime(run.createdAt)}
              </time>
              {run.error && (
                <span role="alert" className="wrap-break-word text-destructive">
                  {run.error}
                </span>
              )}
              {run.assessments.map((assessment) => {
                const display = formatVerificationOutcome(assessment.outcome);
                return (
                  <div
                    key={assessment.findingId}
                    className="flex items-start gap-2"
                  >
                    <TooltipWrapper content={display.label}>
                      <display.Icon
                        aria-label={display.label}
                        className="mt-1 size-4 shrink-0 text-muted-foreground"
                      />
                    </TooltipWrapper>
                    <span className="wrap-break-word">
                      {assessment.explanation}
                    </span>
                  </div>
                );
              })}
              <span className="text-muted-foreground">
                Model assessments, passing checks, and your finding decisions
                remain separate.
              </span>
            </div>
          </CollapsibleContent>
        </Collapsible>
      );
    })}
  </div>
);
