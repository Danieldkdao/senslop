"use client";

import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { Pencil } from "lucide-react";
import { useState } from "react";
import {
  criterionStatuses,
  type ReviewBriefSchema,
  type RequirementCoverageSchema,
  type RequirementEvidenceSchema,
  type CriterionStatus,
} from "@senslop/contracts";
import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatCriterionStatus } from "../lib/formatters";

export const RequirementsView = ({
  brief,
  coverage,
  stale,
  onEvidence,
  onEdit,
  className,
}: {
  brief?: ReviewBriefSchema | null;
  coverage?: RequirementCoverageSchema;
  stale: boolean;
  onEvidence?: (evidence: RequirementEvidenceSchema) => void;
  onEdit: () => void;
  className?: string;
}) => {
  const [filter, setFilter] = useState<CriterionStatus | "all">("all");
  return (
    <section
      aria-label="Requirement coverage"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-3 scroll-fade-y overflow-auto p-4 text-base",
        className,
      )}
    >
      {!brief ? (
        <>
          <p className="text-muted-foreground">
            Attach the original request to review the implementation against it.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onEdit} className="flex-1">
              Add review brief
            </Button>
            <TooltipWrapper content="Edit review brief">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Edit review brief"
                onClick={onEdit}
              >
                <Pencil />
              </Button>
            </TooltipWrapper>
          </div>
        </>
      ) : (
        <>
          {stale && (
            <p
              role="status"
              className="rounded-lg border p-3 text-muted-foreground"
            >
              Coverage is outdated. Run a review against the current brief and
              source.
            </p>
          )}
          {!coverage && (
            <p className="text-muted-foreground">
              Run a review to assess these criteria. Verification requires
              relevant checks linked in the brief.
            </p>
          )}
          {coverage && !stale && (
            <div className="flex flex-wrap gap-3">
              {criterionStatuses.map((status) => {
                const display = formatCriterionStatus(status);
                return (
                  <span
                    key={status}
                    className={cn(
                      "inline-flex items-center gap-1",
                      display.className,
                    )}
                  >
                    <display.Icon className="size-4" />
                    {
                      coverage.criteria.filter((item) => item.status === status)
                        .length
                    }{" "}
                    {display.label}
                  </span>
                );
              })}
            </div>
          )}
          <Select
            value={filter}
            onValueChange={(value) => {
              if (value) setFilter(value as CriterionStatus | "all");
            }}
          >
            <SelectTrigger
              aria-label="Filter requirements"
              className="w-full text-base"
            >
              <SelectValue>
                {filter === "all"
                  ? "All requirements"
                  : formatCriterionStatus(filter).label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All requirements</SelectItem>
              {criterionStatuses.map((status) => (
                <SelectItem key={status} value={status}>
                  {formatCriterionStatus(status).label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {brief.criteria.map((criterion, index) => {
            const assessment = coverage?.criteria.find(
              (item) => item.criterionId === criterion.id,
            );
            if (filter !== "all" && assessment?.status !== filter) return null;
            const status = formatCriterionStatus(
              !stale && assessment ? assessment.status : "unclear",
            );
            return (
              <Collapsible
                key={criterion.id}
                defaultOpen
                className="rounded-lg border p-3"
              >
                <CollapsibleTrigger className="group relative w-full min-w-0 pr-7 text-left cursor-pointer">
                  <span className="font-mono text-muted-foreground">
                    R{index + 1}
                  </span>
                  <span className="ml-2 font-medium">{criterion.text}</span>
                  <span
                    className={cn(
                      "mt-2 flex items-center gap-2",
                      status.className,
                    )}
                  >
                    <status.Icon className="size-4" />
                    {stale
                      ? "Outdated"
                      : assessment
                        ? status.label
                        : "Not assessed"}
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className="absolute right-1 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-transform group-data-panel-open:rotate-180 motion-reduce:transition-none"
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 data-starting-style:h-0 data-starting-style:opacity-0 data-ending-style:h-0 data-ending-style:opacity-0 motion-reduce:transition-none">
                  <div className="flex flex-col gap-3 pt-3">
                    {criterion.sourceQuote && (
                      <blockquote className="border-l-2 pl-3 text-muted-foreground">
                        {criterion.sourceQuote}
                      </blockquote>
                    )}
                    {assessment && (
                      <>
                        <p>{assessment.explanation}</p>
                        {assessment.evidence.map((evidence, evidenceIndex) => (
                          <Button
                            key={evidenceIndex}
                            variant="link"
                            className="h-auto justify-start whitespace-normal p-0 text-left font-mono text-base"
                            disabled={!onEvidence}
                            title={
                              !onEvidence
                                ? "Evidence belongs to an older review round."
                                : undefined
                            }
                            onClick={() => onEvidence?.(evidence)}
                          >
                            {evidence.path}:{evidence.start}–{evidence.end} (
                            {evidence.side})
                          </Button>
                        ))}
                        {assessment.checkIds.map((id) => (
                          <p
                            key={id}
                            className="break-all text-muted-foreground"
                          >
                            Linked check:{" "}
                            <span className="font-mono">{id}</span>
                          </p>
                        ))}
                        {assessment.questions.map((question) => (
                          <p key={question} className="text-muted-foreground">
                            Question: {question}
                          </p>
                        ))}
                      </>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
          {!!coverage?.unexpectedChanges.length && (
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="group relative w-full min-w-0 pr-7 text-left cursor-pointer font-medium">
                Unexpected changes
                <ChevronDown
                  aria-hidden="true"
                  className="absolute right-1 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-transform group-data-panel-open:rotate-180 motion-reduce:transition-none"
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 data-starting-style:h-0 data-starting-style:opacity-0 data-ending-style:h-0 data-ending-style:opacity-0 motion-reduce:transition-none">
                <div className="flex flex-col gap-3 pt-3">
                  {coverage.unexpectedChanges.map((change) => (
                    <p key={change.path}>
                      <span className="font-mono">{change.path}</span>
                      <span className="block text-muted-foreground">
                        {change.explanation}
                      </span>
                    </p>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
          {coverage?.limitations.map((limitation) => (
            <p key={limitation} className="text-muted-foreground">
              {limitation}
            </p>
          ))}
        </>
      )}
    </section>
  );
};
