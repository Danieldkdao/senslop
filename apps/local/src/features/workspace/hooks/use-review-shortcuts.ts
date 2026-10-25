"use client";

import { useEffect, useRef } from "react";
import { hasOpenKeyboardOverlay } from "@senslop/ui/lib/keyboard-shortcuts";
import { useKeyboardShortcuts } from "@senslop/ui/hooks/use-keyboard-shortcuts";
import { toast } from "@/components/ui/toast";
import { useReviewHistory } from "./use-review-history";

type ReviewShortcutsOptions = {
  currentReviewId?: string;
  enabled: boolean;
  busy: boolean;
  historyOpen: boolean;
  onOpenHistory: () => void;
  onAction: (body: object) => Promise<boolean>;
};

export const useReviewShortcuts = ({
  currentReviewId,
  enabled,
  busy,
  historyOpen,
  onOpenHistory,
  onAction,
}: ReviewShortcutsOptions) => {
  const history = useReviewHistory("", false);
  const switching = useRef(false);
  const latest = useRef({
    enabled,
    busy,
    historyOpen,
    currentReviewId,
    onAction,
  });
  useEffect(() => {
    latest.current = { enabled, busy, historyOpen, currentReviewId, onAction };
  });
  const switchReview = async (direction: -1 | 1, signal: AbortSignal) => {
    if (!currentReviewId || switching.current) return;
    switching.current = true;
    try {
      const { data: existingReviews, error } = await history.refetch();
      if (signal.aborted) return;
      if (error) {
        toast.error(error.message);
        return;
      }
      const current = latest.current;
      if (
        !current.enabled ||
        current.busy ||
        current.historyOpen ||
        current.currentReviewId !== currentReviewId ||
        hasOpenKeyboardOverlay()
      )
        return;
      const index =
        existingReviews?.findIndex((review) => review.id === currentReviewId) ??
        -1;
      const review =
        index < 0 ? undefined : existingReviews?.[index + direction];
      if (review) await current.onAction({ action: "open", id: review.id });
    } finally {
      switching.current = false;
    }
  };
  useKeyboardShortcuts(
    [
      { hotkey: "R", callback: onOpenHistory },
      {
        hotkey: "[",
        callback: (_event, { signal }) => {
          void switchReview(-1, signal);
        },
        options: {
          shouldHandle: (event) =>
            !event.shiftKey && !!currentReviewId && !switching.current,
        },
      },
      {
        hotkey: "]",
        callback: (_event, { signal }) => {
          void switchReview(1, signal);
        },
        options: {
          shouldHandle: (event) =>
            !event.shiftKey && !!currentReviewId && !switching.current,
        },
      },
    ],
    {
      enabled: enabled && !busy && !historyOpen,
      shouldHandle: () => !switching.current,
    },
  );
};
