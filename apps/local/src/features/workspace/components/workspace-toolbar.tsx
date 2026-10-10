"use client";

import { useCallback, useEffect, useState } from "react";
import { Dot, History, RefreshCw } from "lucide-react";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLivePreview } from "../../review/components/live-preview-provider";
import type { WorkspaceMetadata } from "../types";
import { formatFreshness } from "../lib/formatters";
import { ReviewHistory } from "./review-history";
import { NewReviewPopover } from "./new-review-popover";

export const WorkspaceToolbar = () => {
  const { preview, refresh } = useLivePreview();
  const [metadata, setMetadata] = useState<WorkspaceMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/workspace", {
      cache: "no-store",
      signal,
    });
    const data = (await response.json()) as WorkspaceMetadata & {
      message?: string;
    };
    if (!response.ok)
      throw new Error(data.message ?? "Repository unavailable. Retry.");
    if (!signal?.aborted) {
      setMetadata(data);
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        await load(abort.signal);
      } catch (failure) {
        if (!abort.signal.aborted) {
          setError(
            failure instanceof Error
              ? failure.message
              : "Repository or local history unavailable. Retry after checking Git and application-data permissions.",
          );
          setLoading(false);
        }
      } finally {
        if (!abort.signal.aborted) timer = setTimeout(tick, 5000);
      }
    };
    void tick();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [load]);
  const act = async (body: object) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { message?: string } | null;
      if (!response.ok)
        throw new Error(data?.message ?? "Local operation failed. Retry.");
      await refresh();
      await load();
      return true;
    } catch (error) {
      setError((error as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="flex shrink-0 items-center gap-1"
      aria-label="Review actions"
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
      <TooltipWrapper content="Refresh repository">
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
      <TooltipWrapper content="Saved reviews">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Saved reviews"
          onClick={() => setHistoryOpen(true)}
        >
          <History aria-hidden="true" className="size-5" />
        </Button>
      </TooltipWrapper>
      <ReviewHistory
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onAction={act}
      />
      <NewReviewPopover
        metadata={metadata}
        preview={preview}
        loading={loading}
        busy={busy}
        error={error}
        onInspect={(source) => act({ action: "inspect", source })}
      />
    </div>
  );
};
