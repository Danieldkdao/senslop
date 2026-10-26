"use client";

import { ReviewReportDialog } from "../../reports/components/review-report-dialog";
import { GitDialog } from "../../git/components/git-dialog";

import { savedReviewSchema } from "@senslop/contracts";
import { useEffect, useState, type ReactNode } from "react";
import { Dot, LibraryBig, RefreshCw } from "lucide-react";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useLivePreview } from "../../review/components/live-preview-provider";
import { useWorkspaceMetadata } from "../hooks/use-workspace-metadata";
import { useReviewShortcuts } from "../hooks/use-review-shortcuts";
import {
  formatFreshness,
  formatResyncUnavailableReason,
} from "../lib/formatters";
import { ReviewHistory } from "./review-history";
import { ResyncPopover } from "./resync-popover";
import { NewReviewPopover } from "./new-review-popover";
import { ContextInspector } from "../../workflow/components/context-inspector";
import { RoundComparison } from "../../workflow/components/round-comparison";

export const WorkspaceToolbar = ({
  preparing = false,
  onOpenFile,
  groupingAction,
}: {
  preparing?: boolean;
  groupingAction?: ReactNode;
  onOpenFile?: (path: string) => void;
}) => {
  const { preview, refresh, openReview, trackReviewOperation } =
    useLivePreview();
  const repository = useWorkspaceMetadata();
  const metadata = repository.data ?? null;
  const [actionError, setError] = useState<string | null>(null);
  const error = actionError ?? repository.error?.message ?? null;
  const loading = repository.isPending;
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => {
    const show = () => setHistoryOpen(true);
    window.addEventListener("senslop-history", show);
    return () => window.removeEventListener("senslop-history", show);
  }, []);
  const [shortcutsEnabled, setShortcutsEnabled] = useState(true);
  const load = async () => {
    const result = await repository.refetch();
    if (result.error) throw result.error;
  };
  const act = async (body: object, notify?: "inspect" | "new" | "keep") => {
    setBusy(true);
    setError(null);
    if (!notify) trackReviewOperation(null);
    try {
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { message?: string } | null;
      if (!response.ok)
        throw new Error(data?.message ?? "Local operation failed. Retry.");
      const savedReview = savedReviewSchema.safeParse(data);
      if (notify && savedReview.success)
        trackReviewOperation({
          snapshotId: savedReview.data.id,
          hash: savedReview.data.hash,
          mode: notify,
        });
      if (
        savedReview.success &&
        (notify || ("action" in body && body.action === "open"))
      )
        openReview(savedReview.data);
      await refresh();
      await load();
      return true;
    } catch (error) {
      trackReviewOperation(null);
      setError((error as Error).message);
      if (notify || ("action" in body && body.action === "open"))
        toast.error((error as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  useReviewShortcuts({
    currentReviewId: preview?.id,
    enabled: shortcutsEnabled,
    busy,
    historyOpen,
    onOpenHistory: () => setHistoryOpen(true),
    onAction: act,
  });
  const resyncUnavailableReason = formatResyncUnavailableReason({
    preview,
    repository: metadata?.repository,
    preparing,
    busy,
    loading,
    failed: repository.isError,
  });
  return (
    <div
      className="flex shrink-0 items-center gap-1"
      aria-label="Review actions"
    >
      <div
        role="group"
        aria-label="Review preparation"
        className="flex shrink-0 items-center gap-1"
      >
        <NewReviewPopover
          metadata={metadata}
          preview={preview}
          loading={loading}
          busy={busy}
          error={error}
          onInspect={(source, grouping) =>
            act(
              { action: "inspect", source, grouping, activate: true },
              "inspect",
            )
          }
        />
        <ResyncPopover
          disabled={!!resyncUnavailableReason}
          unavailableReason={resyncUnavailableReason}
          busy={busy}
          error={error}
          onResync={(mode, grouping) =>
            act(
              {
                action: "resync",
                id: preview!.id,
                expectedHash: preview!.hash,
                expectedRound: preview!.round,
                mode,
                grouping,
                activate: true,
              },
              mode,
            )
          }
        />
        {groupingAction}
      </div>
      <Separator
        orientation="vertical"
        aria-hidden="true"
        className="h-5 data-vertical:self-center"
      />
      <div
        role="group"
        aria-label="Saved review evidence"
        className="flex shrink-0 items-center gap-1"
      >
        <TooltipWrapper
          content={shortcutsEnabled ? "Saved reviews (R)" : "Saved reviews"}
        >
          <Button
            variant="ghost"
            size="icon"
            aria-label="Saved reviews"
            aria-keyshortcuts={shortcutsEnabled ? "r" : undefined}
            onClick={() => setHistoryOpen(true)}
          >
            <LibraryBig aria-hidden="true" className="size-5" />
          </Button>
        </TooltipWrapper>
        {preview?.hash && preview.round && (
          <RoundComparison
            review={{
              id: preview.id,
              hash: preview.hash,
              round: preview.round,
            }}
          />
        )}
        {preview?.hash && preview.round && (
          <ContextInspector
            review={{
              id: preview.id,
              hash: preview.hash,
              round: preview.round,
            }}
          />
        )}
        {preview?.hash && preview.round && (
          <ReviewReportDialog
            review={{
              id: preview.id,
              hash: preview.hash,
              round: preview.round,
            }}
          />
        )}
      </div>
      <Separator
        orientation="vertical"
        aria-hidden="true"
        className="h-5 data-vertical:self-center"
      />
      <div
        role="group"
        aria-label="Repository actions"
        className="flex shrink-0 items-center gap-1"
      >
        {preview?.hash && (
          <TooltipWrapper
            content={formatFreshness(
              preview.fingerprint,
              metadata?.repository?.fingerprint,
            )}
          >
            <span
              tabIndex={0}
              role="status"
              aria-label={formatFreshness(
                preview.fingerprint,
                metadata?.repository?.fingerprint,
              )}
              className={cn(
                "flex items-center",
                preview.fingerprint &&
                  metadata?.repository?.fingerprint &&
                  preview.fingerprint !== metadata.repository.fingerprint
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            >
              <Dot aria-hidden="true" className="size-5" />
            </span>
          </TooltipWrapper>
        )}
        <TooltipWrapper content="Refresh repository (Shift+R)">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh repository"
            disabled={busy}
            onClick={() => {
              void Promise.all([load(), refresh()])
                .then(() => setError(null))
                .catch(() => setError("Repository refresh failed. Retry."));
            }}
          >
            <RefreshCw aria-hidden="true" className="size-5" />
          </Button>
        </TooltipWrapper>
        <GitDialog onOpenFile={onOpenFile ?? (() => {})} />
      </div>
      <ReviewHistory
        open={historyOpen}
        currentReviewId={preview?.id}
        currentDirectory={metadata?.directory}
        shortcutsEnabled={shortcutsEnabled}
        onShortcutsEnabledChange={setShortcutsEnabled}
        onOpenChange={setHistoryOpen}
        onAction={act}
      />
    </div>
  );
};
