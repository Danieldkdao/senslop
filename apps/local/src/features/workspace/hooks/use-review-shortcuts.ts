"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import {
  hasOpenKeyboardOverlay,
  isPlainKeyboardShortcutBlocked,
} from "@senslop/ui/lib/keyboard-shortcuts";
import { toast } from "@/components/ui/toast";
import type { SavedReviewSummary } from "../types";
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
  const openAdjacentReview = useEffectEvent(
    (reviews: SavedReviewSummary[], id: string, direction: -1 | 1) => {
      if (
        !enabled ||
        busy ||
        historyOpen ||
        currentReviewId !== id ||
        hasOpenKeyboardOverlay()
      )
        return;
      const index = reviews.findIndex((review) => review.id === id);
      const review = index < 0 ? undefined : reviews[index + direction];
      if (review) return onAction({ action: "open", id: review.id });
    },
  );
  const onKeyDown = useEffectEvent(
    async (event: KeyboardEvent, signal: AbortSignal) => {
      if (
        !enabled ||
        busy ||
        historyOpen ||
        switching.current ||
        event.repeat ||
        isPlainKeyboardShortcutBlocked(event)
      )
        return;
      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        onOpenHistory();
        return;
      }
      if (!currentReviewId || (event.key !== "[" && event.key !== "]")) return;
      event.preventDefault();
      switching.current = true;
      try {
        const { data: existingReviews, error } = await history.refetch();
        if (signal.aborted) return;
        if (error) {
          toast.error(error.message);
          return;
        }
        await openAdjacentReview(
          existingReviews ?? [],
          currentReviewId,
          event.key === "[" ? -1 : 1,
        );
      } finally {
        switching.current = false;
      }
    },
  );

  useEffect(() => {
    const controller = new AbortController();
    const listener = (event: KeyboardEvent) => {
      void onKeyDown(event, controller.signal);
    };
    document.addEventListener("keydown", listener);
    return () => {
      controller.abort();
      document.removeEventListener("keydown", listener);
    };
  }, []);
};
