"use client";

import { StopCircle, BrainCircuit, CircleAlert, Clock3 } from "lucide-react";
import type {
  VerificationRunSchema,
  TrackedFindingSchema,
} from "@senslop/contracts";
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
  formatVerificationNextStep,
  formatVerificationOutcome,
  formatActivityTime,
} from "../lib/formatters";
import { WorkflowChevron, WorkflowDisclosure } from "./workflow-disclosure";
import { WorkflowHistoryAction } from "./workflow-history-action";
import type { WorkflowActionSchema } from "../schemas";

export const VerificationResults = ({
  runs,
  findings = [],
  onAction,
}: {
  runs: VerificationRunSchema[];
  findings?: TrackedFindingSchema[];
  onAction: (action: WorkflowActionSchema) => Promise<unknown>;
}) => (
  <div className="flex flex-col">
    {!runs.length && (
      <span className="p-4 text-base text-muted-foreground">
        Select findings in Review, then use Verify to assess this round.
      </span>
    )}
    {runs.map((run) => {
      const status = formatWorkflowJobStatus(run.status);
      return (
        <Collapsible
          key={run.id}
          className="flex min-w-0 flex-col gap-3 border-b p-4"
        >
          <div className="flex items-start gap-2 text-base leading-6">
            <TooltipWrapper content={status.label}>
              <span
                tabIndex={0}
                role="status"
                aria-label={status.label}
                className="flex h-lh items-center"
              >
                <status.Icon
                  aria-hidden="true"
                  className={cn(
                    "size-5 shrink-0 text-muted-foreground",
                    status.loading && "animate-spin",
                  )}
                />
              </span>
            </TooltipWrapper>
            <CollapsibleTrigger className="flex min-w-0 flex-1 items-start gap-2 text-left leading-6 text-base">
              <span className="flex-1">
                Round {run.review.round}, {run.assessments.length}/
                {run.findingIds.length} assessed
              </span>
              <WorkflowChevron />
            </CollapsibleTrigger>
            {["queued", "running"].includes(run.status) && (
              <TooltipWrapper
                content="Cancel verification"
                className="h-lh items-center"
              >
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
                  <StopCircle aria-hidden="true" className="size-5 shrink-0" />
                </Button>
              </TooltipWrapper>
            )}
            <WorkflowHistoryAction
              kind="verification"
              id={run.id}
              disabled={["queued", "running"].includes(run.status)}
              onAction={onAction}
            />
          </div>
          <CollapsibleContent>
            <div className="flex flex-col gap-3 text-base">
              <time
                dateTime={run.createdAt}
                className="flex items-center gap-2 text-muted-foreground"
              >
                <Clock3 className="size-5 shrink-0" />
                {formatActivityTime(run.createdAt)}
              </time>
              {run.error && (
                <WorkflowDisclosure
                  title="Error details"
                  Icon={CircleAlert}
                  destructive
                >
                  <p role="alert" className="wrap-break-word">
                    {run.error}
                  </p>
                </WorkflowDisclosure>
              )}
              {run.findingIds.map((findingId) => {
                const assessment = run.assessments.find(
                  (item) => item.findingId === findingId,
                );
                const display = assessment
                  ? formatVerificationOutcome(assessment.outcome)
                  : status;
                const title =
                  findings
                    .find((finding) => finding.id === findingId)
                    ?.observations.at(-1)?.evidence.title ??
                  "Finding assessment";
                return (
                  <WorkflowDisclosure
                    key={findingId}
                    title={title}
                    Icon={display.Icon}
                    iconLabel={display.label}
                    loading={display.loading}
                  >
                    <div className="flex min-w-0 flex-col gap-3">
                      <p className="font-medium">{display.label}</p>
                      {assessment ? (
                        <>
                          <p className="text-muted-foreground">
                            {formatVerificationNextStep(assessment.outcome)}
                          </p>
                          <WorkflowDisclosure
                            title="Reasoning & evidence"
                            Icon={BrainCircuit}
                          >
                            <p className="whitespace-pre-wrap wrap-break-word">
                              {assessment.explanation}
                            </p>
                          </WorkflowDisclosure>
                        </>
                      ) : (
                        <p className="text-muted-foreground">
                          {run.status === "queued" || run.status === "running"
                            ? "The assessment will appear here when verification finishes."
                            : "No assessment was recorded for this finding."}
                        </p>
                      )}
                    </div>
                  </WorkflowDisclosure>
                );
              })}
              <span className="text-base text-muted-foreground">
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
