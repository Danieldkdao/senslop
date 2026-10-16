"use client";

import { useState } from "react";
import { History } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { matchesJobSnapshot } from "../lib/job-snapshots";
import { assignedModel } from "../lib/model-selection";
import { useAiSettings } from "../hooks/use-ai-settings";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { Button } from "@/components/ui/button";
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

export const AgentPanel = ({
  snapshotId,
  snapshot,
  agents,
  onEvidence,
  preparing = false,
  snapshotFingerprint,
  requireFreshSnapshot = false,
  hasChanges = true,
}: {
  snapshotId?: string;
  snapshot?: LivePreview | null;
  snapshotFingerprint?: string | null;
  requireFreshSnapshot?: boolean;
  hasChanges?: boolean;
  preparing?: boolean;
  agents: ReturnType<typeof useAgentState>;
  onEvidence: (finding: FindingSchema) => void;
}) => {
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
  const [selectedRun, setSelectedRun] = useState<JobSchema | null>(null);
  const [stopping, setStopping] = useState(false);
  const [history, setHistory] = useState(false);
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
  return (
    <aside
      aria-label="Agents"
      className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground"
    >
      <Tabs defaultValue="chat" className="min-h-0 flex-1 gap-0 flex flex-col">
        <header className="flex h-14 shrink-0 items-center border-b px-4">
          <TabsList className="shrink-0 w-full">
            <TabsTrigger
              value="chat"
              disabled={preparing}
              className="text-base"
            >
              Chat
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
            className="min-h-0 overflow-auto text-base"
          >
            <header className="flex flex-col gap-3 border-b p-4">
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
                    <LoadingSwap isLoading={stopping}>Stop review</LoadingSwap>
                  </Button>
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
              {latest && (
                <p
                  role="status"
                  className={cn("flex items-center gap-2", status?.className)}
                >
                  {StatusIcon && (
                    <StatusIcon
                      aria-hidden="true"
                      className="size-4 shrink-0"
                    />
                  )}
                  {formatJobStatus(latest.status)}
                  {running &&
                  latest.progress &&
                  latest.progress !== formatJobStatus(latest.status)
                    ? `: ${latest.progress}`
                    : ""}
                </p>
              )}
              {latest?.error && (
                <p role="alert" className="text-destructive">
                  {latest.error}
                </p>
              )}
            </header>
            {displayed?.status === "completed" ? (
              <>
                <p className="px-4 pt-4 font-mono font-semibold text-muted-foreground">
                  {formatReviewName(displayed)}
                  <span className="block">{formatJobModel(displayed)}</span>
                </p>
                {olderResult && (
                  <p role="status" className="px-4 pt-4 text-muted-foreground">
                    Older round. Evidence navigation is unavailable for these
                    previous contents.
                  </p>
                )}
                <ReviewResults
                  job={displayed}
                  onEvidence={olderResult ? undefined : onEvidence}
                />
              </>
            ) : (
              <p className="p-5 text-muted-foreground">
                Run a review to check the selected changes using codebase
                context.
              </p>
            )}
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
    </aside>
  );
};
