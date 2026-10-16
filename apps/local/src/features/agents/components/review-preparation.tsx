"use client";

import { useState } from "react";
import { useConfirm } from "@/hooks/use-confirm";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { CircleAlert, LoaderCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { JobSchema } from "../schemas";

export const ReviewPreparation = ({
  job,
  error,
  configured,
  onRetry,
  onConfigure,
  onDiscard,
  onStop,
}: {
  job?: JobSchema;
  error?: string;
  configured: boolean;
  onRetry: () => Promise<unknown>;
  onConfigure: () => void;
  onDiscard: () => Promise<void>;
  onStop: (id: string) => Promise<unknown>;
}) => {
  const [busy, setBusy] = useState<"retry" | "discard" | "stop" | null>(null);
  const { confirm, ConfirmationDialog } = useConfirm(
    "Discard this review?",
    "This removes the current snapshot, its notes, and AI results. Your repository files and Git history are unchanged.",
  );
  const act = async (action: "retry" | "discard" | "stop") => {
    if (busy || (action === "discard" && !(await confirm()))) return;
    setBusy(action);
    try {
      if (action === "retry") await onRetry();
      else if (action === "stop" && job) await onStop(job.id);
      else await onDiscard();
    } catch {
      // The request handlers report failures through the shared toast system.
    } finally {
      setBusy(null);
    }
  };
  const stopped = job?.status === "canceled";
  const running = job?.status === "queued" || job?.status === "running";
  const failed = job?.status === "failed";
  const failure =
    error ??
    job?.error ??
    (failed
      ? "Grouping was interrupted. Retry to prepare this review."
      : undefined);
  const needsModel = !job && !configured;
  return (
    <>
      {ConfirmationDialog}
      <div className="flex h-full min-h-0 flex-1 items-center justify-center overflow-auto p-6">
        <div className="max-w-md text-center flex flex-col gap-5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 duration-300">
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-muted">
            {stopped ? (
              <CircleAlert className="size-8 text-muted-foreground" />
            ) : failure ? (
              <CircleAlert className="size-8 text-destructive" />
            ) : needsModel ? (
              <Sparkles className="size-8 text-primary" />
            ) : (
              <LoaderCircle className="size-8 text-primary motion-safe:animate-spin" />
            )}
          </div>
          <div
            role={failure ? "alert" : "status"}
            aria-live="polite"
            className="flex flex-col gap-2"
          >
            <h1 className="text-xl font-medium">
              {stopped
                ? "Review stopped"
                : failure
                  ? "Couldn’t prepare your review"
                  : needsModel
                    ? "Choose a grouping model"
                    : "Preparing your review"}
            </h1>
            <p className="text-muted-foreground">
              {stopped
                ? "Your snapshot is saved. Retry grouping to continue, or discard this review."
                : (failure ??
                  (needsModel
                    ? "Configure a model in AI settings to group and summarize this review."
                    : "Organizing changed files and writing summaries. Your review will open when everything is ready."))}
            </p>
            {!failure && !stopped && !needsModel && (
              <p className="text-muted-foreground">
                {job?.progress ?? "Starting local grouping…"}
              </p>
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {running && (
              <Button
                className="text-base"
                variant="outline"
                aria-label="Stop review"
                aria-busy={busy === "stop"}
                disabled={!!busy}
                onClick={() => void act("stop")}
              >
                <LoadingSwap isLoading={busy === "stop"}>
                  Stop review
                </LoadingSwap>
              </Button>
            )}
            {(failure || stopped || (!job && configured)) && (
              <Button
                className="text-base"
                variant="outline"
                aria-label="Retry grouping"
                aria-busy={busy === "retry"}
                disabled={!!busy || !configured}
                onClick={() => void act("retry")}
              >
                <LoadingSwap isLoading={busy === "retry"}>
                  Retry grouping
                </LoadingSwap>
              </Button>
            )}
            {(failure || stopped) && (
              <Button
                className="text-base"
                variant="outline"
                aria-label="Discard review"
                aria-busy={busy === "discard"}
                disabled={!!busy}
                onClick={() => void act("discard")}
              >
                <LoadingSwap isLoading={busy === "discard"}>
                  Discard review
                </LoadingSwap>
              </Button>
            )}
            <Button
              className="text-base"
              variant={needsModel ? "default" : "ghost"}
              onClick={onConfigure}
            >
              Configure AI
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};
