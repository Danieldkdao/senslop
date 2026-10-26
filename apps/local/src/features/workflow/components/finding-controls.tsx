"use client";
import { RememberDecision } from "../../memory/components/remember-decision";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { History, MessageSquarePlus, Link2, Unlink } from "lucide-react";
import {
  findingDecisions,
  type TrackedFindingSchema,
  type ReviewIdentitySchema,
} from "@senslop/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
} from "@/components/ui/popover";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  formatFindingDecision,
  formatVerificationOutcome,
  formatFindingActivity,
  formatActivityTime,
} from "../lib/formatters";
import type { WorkflowActionSchema } from "../schemas";
import { WorkflowChevron } from "./workflow-disclosure";
import type { ReactNode } from "react";
import { ManualVerification } from "./manual-verification";

const reasonSchema = z.object({ reason: z.string().max(5000) });
export type ReasonSchema = z.infer<typeof reasonSchema>;
export const FindingControls = ({
  finding,
  children,
  onAction,
  review,
  allFindings = [],
}: {
  finding: TrackedFindingSchema;
  children?: ReactNode;
  allFindings?: TrackedFindingSchema[];
  review?: ReviewIdentitySchema;
  onAction: (operation: WorkflowActionSchema) => Promise<unknown>;
}) => {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const form = useForm<ReasonSchema>({
    resolver: zodResolver(reasonSchema),
    defaultValues: { reason: "" },
  });
  const display = formatFindingDecision(finding.decision);
  const currentAssessment =
    finding.assessment &&
    (!review ||
      (finding.assessment.review.hash === review.hash &&
        finding.assessment.review.round === review.round));
  const assessment = formatVerificationOutcome(
    currentAssessment ? finding.assessment!.outcome : "unverified",
  );
  const act = async (operation: WorkflowActionSchema) => {
    setBusy(true);
    try {
      await onAction(operation);
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex w-full items-center gap-2">
        <Select
          value={finding.decision}
          onValueChange={(value) => {
            if (value)
              void act({
                action: "decision",
                findingId: finding.id,
                decision: value,
              });
          }}
          disabled={busy}
        >
          <SelectTrigger
            aria-label="Finding decision"
            className="w-full min-w-0 flex-1 text-base"
          >
            <SelectValue className="flex items-center gap-2">
              <display.Icon aria-hidden="true" className="size-5 shrink-0" />
              {display.label}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {findingDecisions.map((value) => {
              const item = formatFindingDecision(value);
              return (
                <SelectItem key={value} value={value} className="text-base">
                  <span className="flex items-center gap-2">
                    <item.Icon aria-hidden="true" className="size-5 shrink-0" />
                    {item.label}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <Popover open={open} onOpenChange={setOpen}>
          <TooltipWrapper content="Explain your finding decision">
            <PopoverTrigger
              render={
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Add optional reason"
                />
              }
            >
              <MessageSquarePlus aria-hidden="true" className="size-4" />
            </PopoverTrigger>
          </TooltipWrapper>
          <PopoverContent className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 text-base">
            <PopoverTitle>Optional reason</PopoverTitle>
            <form
              noValidate
              onSubmit={form.handleSubmit(async (values) => {
                const saved = await act({
                  action: "decision",
                  findingId: finding.id,
                  decision: finding.decision,
                  reason: values.reason,
                });
                if (saved) setOpen(false);
              })}
              className="flex w-full flex-col gap-3"
            >
              <Input
                aria-label="Optional reason"
                {...form.register("reason")}
                className="w-full text-base"
              />
              <Button type="submit" disabled={busy}>
                <LoadingSwap isLoading={busy}>Save reason</LoadingSwap>
              </Button>
            </form>
          </PopoverContent>
        </Popover>
        <ManualVerification findingId={finding.id} onAction={onAction} />
        {review &&
          finding.decision !== "open" &&
          finding.observations.at(-1) && (
            <RememberDecision
              review={review}
              text={finding.history.at(-1)?.reason ?? ""}
              path={finding.observations.at(-1)!.evidence.path}
              originId={finding.id}
              originKind="finding"
            />
          )}
        {assessment && (
          <TooltipWrapper
            content={`${assessment.label}: ${currentAssessment ? finding.assessment!.explanation : "No assessment for this round"}`}
          >
            <span tabIndex={0} role="status" aria-label={assessment.label}>
              <assessment.Icon
                aria-hidden="true"
                className="size-5 text-muted-foreground"
              />
            </span>
          </TooltipWrapper>
        )}
      </div>
      {children}
      <Collapsible>
        <CollapsibleTrigger className="flex w-full items-center gap-2 text-base text-muted-foreground">
          <History aria-hidden="true" className="size-4" />
          Activity ({finding.history.length})<WorkflowChevron />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ol className="flex flex-col gap-3 border-l pl-3 pt-3">
            {finding.history.map((event) => {
              const activity = formatFindingActivity(event);
              return (
                <li key={event.id} className="flex flex-col gap-1">
                  <span className="flex items-center gap-2 text-base">
                    <activity.Icon
                      aria-hidden="true"
                      className="size-4 shrink-0"
                    />
                    {activity.label}
                  </span>
                  {event.reason && (
                    <span className="wrap-break-word text-muted-foreground">
                      {event.reason}
                    </span>
                  )}
                  <time
                    className="text-base text-muted-foreground"
                    dateTime={event.createdAt}
                  >
                    {formatActivityTime(event.createdAt)}
                  </time>
                </li>
              );
            })}
          </ol>
        </CollapsibleContent>
      </Collapsible>
      {finding.duplicateOf && (
        <div className="flex items-center gap-2">
          <Link2 aria-hidden="true" className="size-4 text-muted-foreground" />
          <span className="min-w-0 flex-1 wrap-break-word text-muted-foreground">
            Linked duplicate:{" "}
            {allFindings
              .find((item) => item.id === finding.duplicateOf)
              ?.observations.at(-1)?.evidence.title ?? "Primary finding"}
          </span>
          <TooltipWrapper content="Unlink duplicate">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Unlink duplicate"
              disabled={busy}
              onClick={() =>
                void act({
                  action: "link",
                  findingId: finding.id,
                  targetId: null,
                })
              }
            >
              <Unlink aria-hidden="true" className="size-4" />
            </Button>
          </TooltipWrapper>
        </div>
      )}
      {!!finding.possibleMatches.length && (
        <div className="flex flex-wrap gap-2">
          {finding.possibleMatches.map((id) => (
            <Button
              key={id}
              variant="outline"
              disabled={busy}
              onClick={() =>
                void act({
                  action: "link",
                  findingId: finding.id,
                  targetId: id,
                })
              }
            >
              <Link2 aria-hidden="true" className="size-4" />
              {allFindings.find((item) => item.id === id)?.observations.at(-1)
                ?.evidence.title ?? "Link possible match"}
            </Button>
          ))}
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() =>
              void act({
                action: "link",
                findingId: finding.id,
                targetId: null,
              })
            }
          >
            Keep separate
          </Button>
        </div>
      )}
    </div>
  );
};
