"use client";

import { useSavedState } from "../../usability/hooks/use-saved-state";

import { formatReviewProfile } from "../../precision/lib/formatters";
import { cn } from "@/lib/utils";
import { ChevronDown, Wrench, ScanSearch, X } from "lucide-react";
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { FindingHistoryEvidence } from "../../workflow/components/finding-history-evidence";
import type { TrackedFindingSchema } from "@senslop/contracts";
import type { WorkflowActionSchema } from "../../workflow/schemas";
import { FindingControls } from "../../workflow/components/finding-controls";
import {
  FindingFilters,
  emptyFindingFilters,
} from "../../workflow/components/finding-filters";
import { formatFindingDecision } from "../../workflow/lib/formatters";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  findingSeverities,
  type JobSchema,
  type FindingSchema,
} from "../schemas";
import { formatSeverity } from "../lib/formatters";
import { fixAllPrompt, findingFixPrompt } from "../lib/validate-results";
import type { LivePreview } from "../../review/types";
import { consolidateReviewLimitations } from "../lib/review-limitations";
import { matchesJobSnapshot } from "../lib/job-snapshots";
import { AgentMarkdown } from "./agent-markdown";
import { FixPrompt } from "./fix-prompt";
import { FindingEvidence } from "./finding-evidence";

export const ReviewResults = ({
  job,
  snapshot,
  onEvidence,
  trackedFindings = [],
  onAction,
  onFix,
  groups = [],
  includeTracked = false,
  className,
}: {
  job?: JobSchema;
  includeTracked?: boolean;
  snapshot?: LivePreview | null;
  onEvidence?: (finding: FindingSchema) => void;
  trackedFindings?: TrackedFindingSchema[];
  onAction?: (operation: WorkflowActionSchema) => Promise<unknown>;
  onFix?: (ids: string[]) => void;
  groups?: { title: string; files: { path: string }[] }[];
  className?: string;
}) => {
  const [verifying, setVerifying] = useState(false);
  const [filters, setFilters] = useSavedState(
    `finding-filters:${snapshot?.id ?? "empty"}`,
    emptyFindingFilters,
  );
  const [selected, setSelected] = useState<string[]>([]);
  const selectedIds = selected.filter((id) =>
    trackedFindings.some(
      (finding) => finding.id === id && !finding.duplicateOf,
    ),
  );
  const result =
    job?.result && "findings" in job.result
      ? job.result
      : { findings: [], limitations: [], fixAllPrompt: "" };
  const findings = includeTracked
    ? [
        ...trackedFindings.map((item) => item.observations.at(-1)!.evidence),
        ...result.findings.filter(
          (finding) =>
            !trackedFindings.some((item) =>
              item.observations.some(
                (observation) =>
                  observation.jobId === job?.id &&
                  observation.evidence.path === finding.path &&
                  observation.evidence.title === finding.title &&
                  observation.evidence.start === finding.start,
              ),
            ),
        ),
      ]
    : result.findings;
  const tracked = (finding: FindingSchema) =>
    trackedFindings.find((item) =>
      item.observations.some(
        (observation) =>
          (includeTracked || observation.jobId === job?.id) &&
          observation.evidence.path === finding.path &&
          observation.evidence.title === finding.title &&
          observation.evidence.start === finding.start,
      ),
    );
  const visible = findings.filter((finding) => {
    const saved = tracked(finding);
    return (
      (!filters.search ||
        `${finding.title} ${finding.problem} ${finding.path}`
          .toLowerCase()
          .includes(filters.search.toLowerCase())) &&
      (filters.severity === "all" || filters.severity === finding.severity) &&
      (filters.file === "all" || filters.file === finding.path) &&
      (filters.status === "all" ||
        (saved?.decision ?? "open") === filters.status) &&
      (filters.category === "all" ||
        (saved?.observations.at(-1)?.evidence.category ?? "uncategorized") ===
          filters.category) &&
      (filters.group === "all" ||
        groups
          .find((group) => group.title === filters.group)
          ?.files.some((file) => file.path === finding.path))
    );
  });
  const limitations = consolidateReviewLimitations(result.limitations);
  const files =
    job && snapshot?.id === job.snapshotId && matchesJobSnapshot(job, snapshot)
      ? snapshot.files
      : [];
  return (
    <div className={cn("flex flex-col gap-6 p-4", className)}>
      {!!findings.length && result.summary && (
        <p className="text-base text-foreground">{result.summary}</p>
      )}
      {!!findings.length && (
        <FixPrompt
          prompt={fixAllPrompt(snapshot?.id ?? job?.snapshotId ?? "", {
            ...result,
            findings,
          })}
        />
      )}
      {!findings.length && (
        <p>
          No verified issues found within the analyzed changes. Check the
          analysis limitations below.
        </p>
      )}
      <FindingFilters
        values={filters}
        onChange={setFilters}
        files={[...new Set(findings.map((finding) => finding.path))]}
        groups={groups.map((group) => group.title)}
      />
      {findingSeverities.map((severity) => {
        const findings = visible.filter(
          (finding) => finding.severity === severity,
        );
        if (!findings.length) return null;
        const display = formatSeverity(severity);
        return (
          <section key={severity} className="flex flex-col gap-3">
            <h3 className={cn("font-medium", display.className)}>
              {display.label}
            </h3>
            {findings.map((finding, index) => {
              const saved = tracked(finding);
              const observation = saved?.observations.at(-1);
              const currentEvidence =
                !observation ||
                (snapshot?.hash === observation.review.hash &&
                  (snapshot?.round ?? 1) === observation.review.round);
              const decision = saved
                ? formatFindingDecision(saved.decision)
                : null;
              return (
                <Collapsible
                  key={saved?.id ?? index}
                  render={<article />}
                  className={cn(
                    "min-w-0 overflow-hidden rounded-lg border",
                    display.cardClassName,
                  )}
                >
                  <div className="flex items-start gap-3 px-3 py-4">
                    {saved && (
                      <Checkbox
                        aria-label={`Select ${finding.title}`}
                        checked={selected.includes(saved.id)}
                        disabled={!!saved.duplicateOf}
                        onCheckedChange={(checked) =>
                          setSelected((ids) =>
                            checked
                              ? [...ids, saved.id]
                              : ids.filter((id) => id !== saved.id),
                          )
                        }
                        className="mt-1 shrink-0"
                      />
                    )}
                    <h4 className="min-w-0 flex-1">
                      <CollapsibleTrigger
                        className={cn(
                          "group/finding flex w-full items-start gap-3 text-left text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                          display.className,
                        )}
                      >
                        {decision && (
                          <decision.Icon
                            aria-hidden="true"
                            className="mt-1 size-4 shrink-0"
                          />
                        )}
                        <span className="min-w-0 flex-1 wrap-anywhere">
                          {finding.title}
                        </span>
                        <ChevronDown
                          aria-hidden="true"
                          className="mt-1 size-4 shrink-0 transition-transform group-data-[panel-open]/finding:rotate-180 motion-reduce:transition-none"
                        />
                      </CollapsibleTrigger>
                    </h4>
                  </div>
                  <CollapsibleContent>
                    <div className="flex min-w-0 flex-col gap-3 px-4 pb-4 text-foreground">
                      <AgentMarkdown>{finding.problem}</AgentMarkdown>
                      {!!finding.profiles?.length && (
                        <div className="flex flex-wrap gap-3 text-muted-foreground">
                          {finding.profiles.map((profile) => {
                            const display = formatReviewProfile(profile);
                            return (
                              <span
                                key={profile}
                                className="inline-flex items-center gap-2"
                              >
                                <display.Icon className="size-4" />
                                {display.label}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {!!finding.ruleIds?.length && (
                        <Collapsible>
                          <CollapsibleTrigger
                            render={
                              <Button
                                variant="ghost"
                                className="w-full justify-between text-base"
                              />
                            }
                          >
                            Cited review rules ({finding.ruleIds.length})
                            <ChevronDown className="size-4" />
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="flex flex-col gap-3 py-2">
                              {finding.ruleIds.map((id) => {
                                const rule =
                                  job?.reviewIntent?.instructions.rules
                                    .filter(
                                      (candidate) =>
                                        candidate.id === id &&
                                        finding.path.startsWith(
                                          candidate.scope,
                                        ),
                                    )
                                    .at(-1);
                                return (
                                  <div key={id} className="flex flex-col gap-1">
                                    <span className="font-medium">{id}</span>
                                    {rule ? (
                                      <>
                                        <span className="font-mono break-all text-muted-foreground">
                                          {rule.source}:{" "}
                                          {rule.scope || "project"}
                                        </span>
                                        <p className="whitespace-pre-wrap">
                                          {rule.text}
                                        </p>
                                      </>
                                    ) : (
                                      <span className="text-muted-foreground">
                                        Captured rule provenance is unavailable
                                        for this observation.
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      )}

                      <FindingEvidence
                        finding={finding}
                        file={
                          currentEvidence
                            ? files.find((file) => file.path === finding.path)
                            : undefined
                        }
                        onEvidence={currentEvidence ? onEvidence : undefined}
                      />
                      {observation && (
                        <FindingHistoryEvidence observation={observation} />
                      )}
                      {(!saved || !onAction) && (
                        <FixPrompt
                          prompt={findingFixPrompt(finding)}
                          secondary
                        />
                      )}
                      {saved && onAction && (
                        <FindingControls
                          finding={saved}
                          allFindings={trackedFindings}
                          review={
                            snapshot?.hash
                              ? {
                                  id: snapshot.id,
                                  hash: snapshot.hash,
                                  round: snapshot.round ?? 1,
                                }
                              : undefined
                          }
                          onAction={onAction}
                        >
                          <FixPrompt
                            prompt={findingFixPrompt(finding)}
                            secondary
                          />
                        </FindingControls>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </section>
        );
      })}
      {!!findings.length && !visible.length && (
        <span role="status" className="text-muted-foreground">
          No findings match these filters.
        </span>
      )}
      {!!selectedIds.length && onFix && (
        <div className="sticky bottom-0 flex items-center gap-2 border-t bg-sidebar py-3">
          <span className="flex-1 text-muted-foreground">
            {selectedIds.length} selected
          </span>
          <TooltipWrapper content="Create fix task">
            <Button
              size="icon"
              aria-label="Create fix task"
              onClick={() => onFix(selectedIds)}
            >
              <Wrench aria-hidden="true" className="size-4" />
            </Button>
          </TooltipWrapper>
          {onAction && (
            <TooltipWrapper content="Verify selected findings">
              <Button
                size="icon"
                variant="outline"
                aria-label="Verify selected findings"
                aria-busy={verifying}
                disabled={verifying}
                onClick={async () => {
                  setVerifying(true);
                  try {
                    await onAction({
                      action: "verify-findings",
                      findingIds: selectedIds,
                    });
                  } catch {
                  } finally {
                    setVerifying(false);
                  }
                }}
              >
                <LoadingSwap
                  isLoading={verifying}
                  className="flex items-center justify-center gap-2"
                >
                  <ScanSearch aria-hidden="true" className="size-4" />
                </LoadingSwap>
              </Button>
            </TooltipWrapper>
          )}
          <TooltipWrapper content="Clear selection">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Clear selection"
              onClick={() => setSelected([])}
            >
              <X aria-hidden="true" className="size-4" />
            </Button>
          </TooltipWrapper>
        </div>
      )}
      {!!limitations.length && (
        <Collapsible
          render={<section />}
          className="flex min-w-0 flex-col gap-3"
        >
          <h3>
            <CollapsibleTrigger className="group/limitations flex w-full items-center gap-2 rounded-md py-2 text-left text-base font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="flex-1">
                Analysis limitations ({limitations.length})
              </span>
              <ChevronDown
                aria-hidden="true"
                className="size-4 shrink-0 transition-transform group-data-panel-open/limitations:rotate-180 motion-reduce:transition-none"
              />
            </CollapsibleTrigger>
          </h3>
          <CollapsibleContent>
            <ul className="list-disc flex flex-col gap-2 pl-5 text-muted-foreground">
              {limitations.map((limitation, index) => (
                <li key={index}>{limitation}</li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};
