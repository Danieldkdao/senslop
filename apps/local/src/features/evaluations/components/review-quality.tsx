"use client";

import { useState } from "react";
import {
  Download,
  FlaskConical,
  Sparkles,
  Square,
  ChevronDown,
  CircleX,
  CircleAlert,
  Copy,
  Crosshair,
  Cpu,
  Timer,
  CircleDollarSign,
  GitBranch,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/hooks/use-confirm";
import { useReviewQuality } from "../hooks/use-review-quality";
import { compareEvaluationRuns } from "../lib/compare-evaluations";
import {
  formatEvaluationPercent,
  formatEvaluationRun,
  formatEvaluationCaseStatus,
  formatEvaluationDuration,
  formatEvaluationTokens,
  formatEvaluationCost,
  formatEvaluationLimitations,
} from "../lib/formatters";

export const ReviewQuality = () => {
  const quality = useReviewQuality();
  const [selectedId, setSelectedId] = useState<string>();
  const [baselineId, setBaselineId] = useState<string>();
  const { confirm, ConfirmationDialog } = useConfirm(
    "Run a live quality evaluation?",
    "Sends the declared synthetic corpus and your saved grouping instructions to the selected Review model. This makes model requests and may incur provider charges. Your project source and saved review data are not included.",
  );
  const runs = quality.state.data ?? [];
  const selected = runs.find((run) => run.id === selectedId) ?? runs[0];
  const baseline = runs.find((run) => run.id === baselineId);
  const comparison =
    baseline && selected ? compareEvaluationRuns(baseline, selected) : null;
  const exportRun = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(selected, null, 2)], {
        type: "application/json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `senslop-quality-${selected?.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="flex min-w-0 flex-col gap-4 text-base">
      <p className="text-muted-foreground">
        Check review behavior with synthetic fixtures or evaluate your selected
        model with a live run.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          disabled={quality.run.isPending}
          onClick={() => quality.run.mutate("deterministic")}
        >
          <LoadingSwap
            isLoading={
              quality.run.isPending && quality.run.variables === "deterministic"
            }
            className="flex items-center gap-2"
          >
            <FlaskConical className="size-4" />
            Run contracts
          </LoadingSwap>
        </Button>
        <Button
          variant="outline"
          disabled={quality.run.isPending}
          onClick={async () => {
            if (await confirm()) quality.run.mutate("live");
          }}
        >
          <LoadingSwap
            isLoading={
              quality.run.isPending && quality.run.variables === "live"
            }
            className="flex items-center gap-2"
          >
            <Sparkles className="size-4" />
            Run live model
          </LoadingSwap>
        </Button>
        {quality.run.isPending && (
          <TooltipWrapper content="Cancel evaluation">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Cancel evaluation"
              onClick={quality.cancel}
            >
              <Square className="size-4" />
            </Button>
          </TooltipWrapper>
        )}
      </div>
      {quality.state.isPending && <p role="status">Loading quality reports…</p>}
      {quality.state.error && <p role="alert">{quality.state.error.message}</p>}
      {selected && (
        <>
          <Select
            value={selected.id}
            onValueChange={(value) => value && setSelectedId(value)}
          >
            <SelectTrigger
              aria-label="Quality report"
              className="w-full text-base"
            >
              <SelectValue>{formatEvaluationRun(selected)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {runs.map((run) => (
                <SelectItem key={run.id} value={run.id}>
                  {formatEvaluationRun(run)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={baselineId ?? "none"}
            onValueChange={(value) =>
              setBaselineId(value === "none" ? undefined : (value ?? undefined))
            }
          >
            <SelectTrigger
              aria-label="Compare with report"
              className="w-full text-base"
            >
              <SelectValue>
                {baseline
                  ? formatEvaluationRun(baseline)
                  : "Choose a comparison baseline"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No comparison</SelectItem>
              {runs
                .filter((run) => run.id !== selected.id)
                .map((run) => (
                  <SelectItem key={run.id} value={run.id}>
                    {formatEvaluationRun(run)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {comparison && !comparison.sameMode && (
            <p className="text-muted-foreground">
              Fixture checks and live judgments measure different things.
            </p>
          )}
          {comparison && !comparison.sameInstructions && (
            <p className="text-muted-foreground">
              The saved instructions differ between these runs.
            </p>
          )}
          {comparison && (
            <p role="status">
              {!comparison.compatibleCorpus
                ? "Different corpus versions prevent an equivalent comparison."
                : comparison.regressions.length
                  ? `Regressions in ${comparison.regressions.join(", ")}.`
                  : "No measured regressions against this baseline."}
            </p>
          )}
          <div
            className="flex flex-wrap gap-x-5 gap-y-3"
            aria-label="Quality metrics"
          >
            {[
              {
                Icon: CircleAlert,
                label: "Missed issues",
                value: selected.totals.missed,
              },
              {
                Icon: CircleX,
                label: "False positives",
                value: selected.totals.falsePositives,
              },
              {
                Icon: Copy,
                label: "Duplicate findings",
                value: selected.totals.duplicates,
              },
              {
                Icon: Crosshair,
                label: "Evidence accuracy",
                value: formatEvaluationPercent(
                  selected.totals.evidenceAccuracy,
                ),
              },
              {
                Icon: Timer,
                label: "Run duration",
                value: formatEvaluationDuration(selected.durationMs),
              },
              {
                Icon: Cpu,
                label: "Tokens used",
                value: formatEvaluationTokens(
                  selected.totals.inputTokens,
                  selected.totals.outputTokens,
                ),
              },
              {
                Icon: CircleDollarSign,
                label: "Estimated cost",
                value: formatEvaluationCost(selected.totals.estimatedCost),
              },
            ].map((metric) => (
              <TooltipWrapper key={metric.label} content={metric.label}>
                <span tabIndex={0} className="flex items-center gap-2">
                  <metric.Icon
                    aria-hidden="true"
                    className="size-4 text-muted-foreground"
                  />
                  <span className="sr-only">{metric.label} </span>
                  <span className="tabular-nums">{metric.value}</span>
                </span>
              </TooltipWrapper>
            ))}
          </div>
          <Button
            variant="outline"
            aria-label="Export quality report"
            onClick={exportRun}
          >
            <Download className="size-4" />
            Export quality report
          </Button>
          {selected.instructions !== undefined && (
            <Collapsible>
              <CollapsibleTrigger
                render={
                  <Button
                    variant="ghost"
                    className="w-full justify-between text-base"
                  />
                }
              >
                Instructions used
                <ChevronDown className="size-4" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="overflow-auto whitespace-pre-wrap text-base">
                  {selected.instructions || "Default evaluation directions"}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          )}
          <div className="flex items-start gap-2 text-muted-foreground">
            <p className="min-w-0 flex-1">
              {formatEvaluationLimitations(selected.mode)}
            </p>
            <TooltipWrapper content={selected.limitations.join(" ")}>
              <span
                tabIndex={0}
                aria-label="Evaluation limitations"
                className="flex h-lh shrink-0 items-center"
              >
                <Info aria-hidden="true" className="size-4" />
              </span>
            </TooltipWrapper>
          </div>
          <Collapsible key={selected.id}>
            <CollapsibleTrigger
              render={
                <Button
                  variant="ghost"
                  className="group w-full justify-between gap-3 text-base"
                />
              }
            >
              <span className="flex items-center gap-2">
                <FlaskConical aria-hidden="true" className="size-4" />
                Fixture results
                <span className="text-muted-foreground tabular-nums">
                  {selected.cases.length}
                </span>
              </span>
              <ChevronDown
                aria-hidden="true"
                className="size-4 shrink-0 transition-transform group-data-panel-open:rotate-180"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="flex max-h-96 min-w-0 flex-col overflow-y-auto overscroll-contain scroll-fade-y">
                {selected.cases.map((item) => {
                  const status = formatEvaluationCaseStatus(
                    item.contractPassed,
                  );
                  return (
                    <Collapsible
                      key={item.caseId}
                      className="flex min-w-0 flex-col gap-2 border-t"
                    >
                      <CollapsibleTrigger
                        render={
                          <Button
                            variant="ghost"
                            className="h-12 w-full items-center justify-between gap-3 py-3 text-left text-base"
                          />
                        }
                      >
                        <span className="flex min-w-0 flex-1 items-start gap-3 leading-6">
                          <TooltipWrapper content={status.label}>
                            <span className="flex h-lh shrink-0 items-center">
                              <status.Icon
                                aria-hidden="true"
                                className={status.className}
                                size={16}
                              />
                              <span className="sr-only">{status.label}</span>
                            </span>
                          </TooltipWrapper>
                          <span className="min-w-0 flex-1 wrap-break-word whitespace-normal">
                            {item.caseId}
                          </span>
                          <TooltipWrapper content="Missed issues">
                            <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                              <CircleAlert
                                aria-hidden="true"
                                className="size-4"
                              />
                              <span className="sr-only">Missed issues </span>
                              {item.missed}
                            </span>
                          </TooltipWrapper>
                          <TooltipWrapper content="False positives">
                            <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                              <CircleX aria-hidden="true" className="size-4" />
                              <span className="sr-only">False positives </span>
                              {item.falsePositives}
                            </span>
                          </TooltipWrapper>
                        </span>
                        <ChevronDown
                          aria-hidden="true"
                          className="h-lh w-4 shrink-0"
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="flex flex-col gap-2 pl-3 pb-3">
                          <p>{item.provenance}</p>
                          {item.contractChecks?.map((check) => (
                            <p key={check}>{check}</p>
                          ))}
                          <div className="flex flex-col gap-1">
                            <h4 className="font-medium">Expected behavior</h4>
                            <p>{item.expected.join("; ") || "Clean change"}</p>
                          </div>
                          <div className="flex flex-wrap gap-4">
                            <TooltipWrapper content="Grouping coverage">
                              <span
                                tabIndex={0}
                                className="flex items-center gap-2"
                              >
                                <GitBranch
                                  aria-hidden="true"
                                  className="size-4 text-muted-foreground"
                                />
                                {formatEvaluationPercent(item.groupingCoverage)}
                              </span>
                            </TooltipWrapper>
                            <TooltipWrapper content="Evidence accuracy">
                              <span
                                tabIndex={0}
                                className="flex items-center gap-2"
                              >
                                <Crosshair
                                  aria-hidden="true"
                                  className="size-4 text-muted-foreground"
                                />
                                {formatEvaluationPercent(item.evidenceAccuracy)}
                              </span>
                            </TooltipWrapper>
                          </div>
                          {item.findings.map((finding, index) => (
                            <div key={index} className="flex flex-col gap-1">
                              <strong>{finding.title}</strong>
                              <p>{finding.problem}</p>
                              <span className="font-mono break-all">
                                {finding.path}:{finding.start}–{finding.end}
                              </span>
                              <pre className="overflow-auto whitespace-pre-wrap text-base">
                                {finding.code}
                              </pre>
                            </div>
                          ))}
                          {item.groupingIssues?.map((issue) => (
                            <p key={issue}>{issue}</p>
                          ))}
                          {item.unitGroups?.map((group) => (
                            <div
                              key={group.title}
                              className="flex flex-col gap-1"
                            >
                              <span className="flex items-center gap-2">
                                <GitBranch
                                  aria-hidden="true"
                                  className="size-4 text-muted-foreground"
                                />
                                {group.title}
                                <span className="text-muted-foreground">
                                  {group.unitIds.length} regions
                                </span>
                              </span>
                              <p>{group.rationale}</p>
                            </div>
                          ))}
                          {item.limitations.map((limitation) => (
                            <p key={limitation}>{limitation}</p>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </>
      )}
      {ConfirmationDialog}
    </div>
  );
};
