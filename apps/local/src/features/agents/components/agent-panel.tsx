"use client";

import {
  ExpandingTabs,
  ExpandingTabsPanel,
} from "@senslop/ui/components/expanding-tabs";
import { useReviewIntent } from "../../precision/hooks/use-review-intent";
import { ReviewBriefForm } from "../../precision/components/review-brief-form";
import { RequirementsView } from "../../precision/components/requirements-view";
import { RulesProfiles } from "../../precision/components/rules-profiles";
import { ReviewOptionsPopover } from "../../precision/components/review-options-popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ClipboardList, ListChecks } from "lucide-react";
import { useState } from "react";
import { ChevronDown, History, Plus } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { matchesJobSnapshot } from "../lib/job-snapshots";
import { assignedModel } from "../lib/model-selection";
import { useAiSettings } from "../hooks/use-ai-settings";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { cn } from "@/lib/utils";
import { useAgentState } from "../hooks/use-agent-state";
import type { FindingSchema, JobSchema } from "../schemas";
import {
  formatJobStatus,
  formatJobModel,
  formatReviewName,
  formatJobStatusAppearance,
} from "../lib/formatters";
import { useWorkspaceMetadata } from "../../workspace/hooks/use-workspace-metadata";
import type { LivePreview } from "../../review/types";
import { formatResyncUnavailableReason } from "../../workspace/lib/formatters";
import { AgentChat } from "./agent-chat";
import { ReviewResults } from "./review-results";
import { AgentReviewHistory } from "./agent-review-history";
import { useReviewWorkflow } from "../../workflow/hooks/use-review-workflow";
import { FixTaskForm } from "../../workflow/components/fix-task-form";
import { WorkPanel } from "../../workflow/components/work-panel";
import { savedReviewSchema } from "@senslop/contracts";
import { UsagePopover } from "../../workflow/components/usage-popover";

export const AgentPanel = ({
  snapshotId,
  snapshot,
  agents,
  onEvidence,
  preparing = false,
  snapshotFingerprint,
  requireFreshSnapshot = false,
  hasChanges = true,
  onOpenSettings,
}: {
  snapshotId?: string;
  snapshot?: LivePreview | null;
  snapshotFingerprint?: string | null;
  requireFreshSnapshot?: boolean;
  hasChanges?: boolean;
  onOpenSettings?: (section: string) => void;
  preparing?: boolean;
  agents: ReturnType<typeof useAgentState>;
  onEvidence: (finding: FindingSchema) => void;
}) => {
  const workflow = useReviewWorkflow(
    snapshot?.hash && snapshot.round
      ? { id: snapshot.id, hash: snapshot.hash, round: snapshot.round }
      : null,
  );
  const identity =
    snapshot?.hash && snapshot.round
      ? { id: snapshot.id, hash: snapshot.hash, round: snapshot.round }
      : null;
  const intent = useReviewIntent(identity);
  const [briefOpen, setBriefOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const repository = useWorkspaceMetadata(
    requireFreshSnapshot || !!snapshotFingerprint,
  );
  const currentFingerprint = repository.data?.repository?.fingerprint;
  const stale =
    !!snapshotFingerprint &&
    !!currentFingerprint &&
    snapshotFingerprint !== currentFingerprint;
  const freshnessUnknown =
    (requireFreshSnapshot || !!snapshotFingerprint) &&
    (!snapshotFingerprint || !currentFingerprint || !!repository.error);
  const resyncUnavailableReason = formatResyncUnavailableReason({
    preview: snapshot ?? null,
    repository: repository.data?.repository,
    preparing,
    busy: false,
    loading: repository.isPending,
    failed: repository.isError,
  });
  const { settings } = useAiSettings();
  const configured = !!assignedModel(settings.data, "review");
  const [tab, setTab] = useState("chat");
  const [fixIds, setFixIds] = useState<string[] | null>(null);
  const savedSnapshot = savedReviewSchema.safeParse(snapshot);
  const [selectedRun, setSelectedRun] = useState<JobSchema | null>(null);
  const [stopping, setStopping] = useState(false);
  const [history, setHistory] = useState(false);
  const [reviewControlsOpen, setReviewControlsOpen] = useState(true);
  const reviews =
    agents.state.data?.jobs.filter((job) => job.kind === "review") ?? [];
  const currentReviews = reviews.filter((job) =>
    snapshot
      ? job.snapshotId === snapshotId && matchesJobSnapshot(job, snapshot)
      : true,
  );
  const latest = currentReviews[0];
  const displayed =
    (selectedRun?.snapshotId === snapshotId ? selectedRun : null) ??
    currentReviews.find((job) => job.status === "completed") ??
    latest;
  const olderResult =
    !!displayed && !!snapshot && !matchesJobSnapshot(displayed, snapshot);
  const running = latest?.status === "running" || latest?.status === "queued";
  const status = latest ? formatJobStatusAppearance(latest.status) : null;
  const StatusIcon = status?.Icon;
  const statusLabel = latest ? formatJobStatus(latest.status) : "New review";
  return (
    <aside
      aria-label="Agents"
      className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground"
    >
      <Tabs
        value={tab}
        onValueChange={(value) =>
          setTab(
            value === "review" ? "review" : value === "work" ? "work" : "chat",
          )
        }
        className="min-h-0 flex-1 gap-0 flex flex-col"
      >
        <header className="flex h-14 shrink-0 items-center border-b px-4">
          <TabsList className="shrink-0 w-full" variant="transparent">
            <TabsTrigger
              value="chat"
              disabled={preparing}
              className="text-base"
            >
              Chat
            </TabsTrigger>
            <TabsTrigger
              value="work"
              className="text-base"
              disabled={!snapshotId}
            >
              Work
            </TabsTrigger>
            <TabsTrigger
              value="review"
              disabled={preparing}
              className="text-base"
            >
              Review
            </TabsTrigger>
          </TabsList>
        </header>
        {preparing && (
          <p role="status" className="p-5 text-base text-muted-foreground">
            Chat and AI reviews will be available when grouping finishes.
          </p>
        )}
        <div
          hidden={preparing}
          inert={preparing}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsContent
            value="chat"
            keepMounted
            className="min-h-0 overflow-hidden text-base"
          >
            {snapshotId ? (
              <AgentChat
                key={snapshotId}
                snapshotId={snapshotId}
                agents={agents}
              />
            ) : (
              <p className="p-5 text-muted-foreground">
                Open a snapshot to start a conversation.
              </p>
            )}
          </TabsContent>
          <TabsContent
            value="review"
            className="flex min-h-0 flex-1 flex-col overflow-hidden text-base"
          >
            <Collapsible
              open={reviewControlsOpen}
              onOpenChange={setReviewControlsOpen}
              className="flex shrink-0 flex-col border-b"
            >
              <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 data-starting-style:h-0 data-starting-style:opacity-0 data-ending-style:h-0 data-ending-style:opacity-0 motion-reduce:transition-none">
                <header className="flex flex-col gap-3 p-4 pb-0">
                  <div className="flex gap-2">
                    <Button
                      className="min-w-0 flex-1 text-base"
                      aria-label="Run review"
                      aria-busy={running}
                      disabled={
                        preparing ||
                        !snapshotId ||
                        running ||
                        !configured ||
                        stale ||
                        freshnessUnknown ||
                        !hasChanges
                      }
                      onClick={() =>
                        void agents
                          .act({
                            action: "job",
                            snapshotId: snapshotId!,
                            kind: "review",
                          })
                          .catch(() => {})
                      }
                    >
                      <LoadingSwap isLoading={running}>Run review</LoadingSwap>
                    </Button>
                    {running && (
                      <Button
                        className="text-base"
                        variant="ghost"
                        aria-label="Stop review"
                        aria-busy={stopping}
                        disabled={stopping}
                        onClick={async () => {
                          if (stopping) return;
                          setStopping(true);
                          try {
                            await agents.act({
                              action: "cancel",
                              id: latest!.id,
                            });
                          } catch {
                            /* The action reports errors through the shared toast system. */
                          } finally {
                            setStopping(false);
                          }
                        }}
                      >
                        <LoadingSwap isLoading={stopping}>
                          Stop review
                        </LoadingSwap>
                      </Button>
                    )}
                    {workflow.state.data && (
                      <UsagePopover
                        usage={workflow.state.data.usage}
                        policy={workflow.state.data.policy}
                        onAction={workflow.act}
                        onOpenSettings={() => onOpenSettings?.("usage")}
                      />
                    )}
                    <TooltipWrapper content="Saved reviews">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Saved reviews"
                        onClick={() => setHistory(true)}
                      >
                        <History aria-hidden="true" className="size-4" />
                      </Button>
                    </TooltipWrapper>
                    <ReviewOptionsPopover
                      policy={workflow.state.data?.policy}
                      instructions={intent.state.data?.instructions}
                      loading={intent.state.isPending}
                      error={intent.state.error?.message}
                      onAction={workflow.act}
                      onBrief={() => setBriefOpen(true)}
                      onRules={() => setRulesOpen(true)}
                    />
                  </div>
                  {(stale || freshnessUnknown) && (
                    <p role="status" className="text-muted-foreground">
                      {stale
                        ? resyncUnavailableReason
                          ? "This snapshot is outdated and cannot be re-synced. Start a new review to capture the current changes before running a review."
                          : "Re-sync your changes before running a review. The repository has changed since this snapshot."
                        : !snapshotFingerprint
                          ? "Start a new review to capture repository freshness before running a review."
                          : "Checking repository freshness. Refresh the repository if this persists."}
                    </p>
                  )}
                  {!configured && (
                    <p className="text-muted-foreground">
                      Choose a Review model in AI settings to run code reviews.
                    </p>
                  )}
                  {latest?.error && (
                    <p role="alert" className="text-destructive">
                      {latest.error}
                    </p>
                  )}
                </header>
              </CollapsibleContent>
              <div className="flex w-full px-4 py-2">
                <TooltipWrapper
                  className="w-full"
                  content={`${reviewControlsOpen ? "Hide" : "Show"} review controls: ${statusLabel}`}
                >
                  <CollapsibleTrigger
                    render={
                      <Button
                        variant="ghost"
                        className="group/review flex h-auto min-h-9 w-full items-center justify-between gap-2 py-2 whitespace-normal pl-0! hover:bg-transparent! dark:hover:bg-transparent!"
                        aria-label={`Review controls: ${statusLabel}`}
                      >
                        {latest ? (
                          <span
                            role="status"
                            className={cn(
                              "flex min-w-0 items-center gap-2 text-left text-base!",
                              status?.className,
                            )}
                          >
                            {StatusIcon && (
                              <StatusIcon
                                aria-hidden="true"
                                className={cn(
                                  "size-4.5 shrink-0",
                                  status?.loading && "animate-spin",
                                )}
                              />
                            )}
                            <span className="min-w-0 wrap-break-word">
                              {running &&
                              latest.progress &&
                              latest.progress !== statusLabel
                                ? latest.progress
                                : statusLabel}
                            </span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <Plus
                              aria-hidden="true"
                              className="size-4.5 shrink-0"
                            />
                            {statusLabel}
                          </span>
                        )}
                        <ChevronDown
                          aria-hidden="true"
                          className="size-4 shrink-0 transition-transform group-data-panel-open/review:rotate-180 motion-reduce:transition-none"
                        />
                      </Button>
                    }
                  />
                </TooltipWrapper>
              </div>
            </Collapsible>
            <ExpandingTabs
              aria-label="Review results"
              variant="transparent"
              items={[
                {
                  value: "findings",
                  label: "Findings",
                  icon: <ListChecks />,
                  detail: workflow.state.data?.findings.length ?? 0,
                },
                {
                  value: "requirements",
                  label: "Requirements",
                  icon: <ClipboardList />,
                  detail: intent.state.data?.briefs[0]?.criteria.length ?? 0,
                },
              ]}
              className="min-h-0 flex-1 gap-0"
              listClassName="mx-4 my-2 w-auto"
            >
              <ExpandingTabsPanel
                value="findings"
                className="flex min-h-0 flex-1 flex-col"
              >
                <section
                  aria-label="Review findings"
                  className="min-h-0 flex-1 overflow-y-auto"
                >
                  {displayed?.status === "completed" ? (
                    <>
                      <p className="px-4 font-mono font-semibold text-muted-foreground">
                        {formatReviewName(displayed)}
                        <span className="block">
                          {formatJobModel(displayed)}
                        </span>
                      </p>
                      {olderResult && (
                        <p
                          role="status"
                          className="px-4 pt-4 text-muted-foreground"
                        >
                          Older round. Open original evidence from a finding to
                          inspect its captured source.
                        </p>
                      )}
                      <ReviewResults
                        job={displayed}
                        includeTracked={!selectedRun}
                        snapshot={snapshot}
                        onEvidence={olderResult ? undefined : onEvidence}
                        trackedFindings={workflow.state.data?.findings}
                        onAction={workflow.act}
                        onFix={
                          savedSnapshot.success
                            ? (ids) => setFixIds(ids)
                            : undefined
                        }
                        groups={agents.state.data?.jobs
                          .flatMap((job) =>
                            job.kind === "grouping" &&
                            job.result &&
                            "groups" in job.result
                              ? job.result.groups
                              : [],
                          )
                          .slice(0, 32)}
                      />
                    </>
                  ) : workflow.state.data?.findings.length ? (
                    <ReviewResults
                      snapshot={snapshot}
                      trackedFindings={workflow.state.data.findings}
                      includeTracked
                      onAction={workflow.act}
                      onFix={(ids) => setFixIds(ids)}
                      className="pt-0"
                    />
                  ) : (
                    <p className="px-4 pb-4 text-muted-foreground">
                      Run a review to check the selected changes using codebase
                      context.
                    </p>
                  )}
                </section>
              </ExpandingTabsPanel>
              <ExpandingTabsPanel
                value="requirements"
                className="flex min-h-0 flex-1 flex-col"
              >
                <RequirementsView
                  brief={intent.state.data?.briefs[0]}
                  coverage={
                    displayed?.result && "findings" in displayed.result
                      ? displayed.result.requirements
                      : undefined
                  }
                  stale={
                    !!olderResult ||
                    !!(
                      displayed &&
                      displayed.reviewIntent?.brief?.version !==
                        intent.state.data?.briefs[0]?.version
                    )
                  }
                  onEvidence={(evidence) =>
                    onEvidence({
                      ...evidence,
                      title: "Requirement evidence",
                      severity: "informational",
                      problem: "Evidence for the selected requirement.",
                      fixPrompt: "",
                    })
                  }
                  onEdit={() => setBriefOpen(true)}
                  className="pt-0"
                />
              </ExpandingTabsPanel>
            </ExpandingTabs>
          </TabsContent>
          <TabsContent
            value="work"
            className="flex min-h-0 flex-1 flex-col overflow-hidden text-base"
          >
            <WorkPanel state={workflow.state.data} onAction={workflow.act} />
          </TabsContent>
        </div>
      </Tabs>
      {agents.state.error && (
        <p role="alert" className="p-4 text-destructive">
          {agents.state.error.message}
          <Button
            className="text-base"
            variant="outline"
            onClick={() => void agents.state.refetch()}
          >
            Retry
          </Button>
        </p>
      )}
      {briefOpen && !intent.state.isPending && (
        <ReviewBriefForm
          brief={intent.state.data?.briefs[0]}
          history={intent.state.data?.briefs}
          documents={intent.state.data?.documents ?? []}
          checks={workflow.state.data?.checks ?? []}
          onAction={intent.act}
          onClose={() => setBriefOpen(false)}
        />
      )}
      {rulesOpen && (
        <Dialog open onOpenChange={setRulesOpen}>
          <DialogContent className="max-h-[85dvh] overflow-auto text-base sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Rules & profiles</DialogTitle>
              <DialogDescription>
                Inspect project conventions and change review coverage.
              </DialogDescription>
            </DialogHeader>
            <RulesProfiles review={identity} />
          </DialogContent>
        </Dialog>
      )}
      <AgentReviewHistory
        key={snapshotId}
        open={history}
        onOpenChange={setHistory}
        snapshotId={snapshotId}
        snapshot={snapshot}
        reviews={reviews}
        onAction={agents.act}
        onSelect={setSelectedRun}
        onDelete={(id) =>
          setSelectedRun((current) => (current?.id === id ? null : current))
        }
        onRename={(id, title) =>
          setSelectedRun((current) =>
            current?.id === id ? { ...current, title } : current,
          )
        }
      />
      {fixIds && savedSnapshot.success && (
        <FixTaskForm
          review={savedSnapshot.data}
          findingIds={fixIds}
          onAction={async (operation) => {
            const result = await workflow.act(operation);
            setTab("work");
            return result;
          }}
          onClose={() => setFixIds(null)}
        />
      )}
    </aside>
  );
};
