"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, RotateCcw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { toast } from "@/components/ui/toast";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { cn } from "@/lib/utils";
import type { SavedReviewSummary } from "../types";
import { formatReviewWork } from "../lib/formatters";

export const ReviewWorkStatus = ({
  job,
}: {
  job: NonNullable<SavedReviewSummary["work"]>[number];
}) => {
  const [busy, setBusy] = useState(false);
  const client = useQueryClient();
  const status = formatReviewWork(job);
  const cancelLabel = `Cancel ${status.task}`;
  const retryLabel = `Retry ${status.task}`;
  const priorityLabel = `${job.priority === "high" ? "Lower priority for" : "Prioritize"} ${status.task}`;
  const act = async (action: "cancel" | "retry" | "priority") => {
    setBusy(true);
    try {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          id: job.id,
          ...(action === "priority"
            ? { priority: job.priority === "high" ? "normal" : "high" }
            : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message ?? "Job operation failed. Retry.");
      await client.invalidateQueries({ queryKey: ["review-history"] });
      await client.invalidateQueries({ queryKey: ["agents"] });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="flex items-center gap-1"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <TooltipWrapper content={status.label}>
        <span
          role="img"
          tabIndex={0}
          aria-label={status.label}
          className="inline-flex size-9 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <status.Icon
            aria-hidden="true"
            className={cn(
              "size-4",
              status.className,
              status.loading && "animate-spin motion-reduce:animate-none",
            )}
          />
        </span>
      </TooltipWrapper>
      {(job.status === "queued" || job.status === "running") && (
        <TooltipWrapper content={cancelLabel}>
          <Button
            variant="ghost"
            size="icon"
            disabled={busy}
            aria-label={cancelLabel}
            onClick={() => void act("cancel")}
          >
            <LoadingSwap isLoading={busy}>
              <Square aria-hidden="true" />
            </LoadingSwap>
          </Button>
        </TooltipWrapper>
      )}
      {(job.status === "failed" || job.status === "canceled") && (
        <TooltipWrapper content={retryLabel}>
          <Button
            variant="ghost"
            size="icon"
            disabled={busy}
            aria-label={retryLabel}
            onClick={() => void act("retry")}
          >
            <LoadingSwap isLoading={busy}>
              <RotateCcw aria-hidden="true" />
            </LoadingSwap>
          </Button>
        </TooltipWrapper>
      )}
      {job.status === "queued" && (
        <TooltipWrapper content={priorityLabel}>
          <Button
            variant="ghost"
            size="icon"
            disabled={busy}
            aria-label={priorityLabel}
            onClick={() => void act("priority")}
          >
            <LoadingSwap isLoading={busy}>
              {job.priority === "high" ? (
                <ArrowDown aria-hidden="true" />
              ) : (
                <ArrowUp aria-hidden="true" />
              )}
            </LoadingSwap>
          </Button>
        </TooltipWrapper>
      )}
    </div>
  );
};
