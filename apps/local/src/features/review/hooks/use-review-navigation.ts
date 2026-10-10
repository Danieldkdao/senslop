"use client";

import { useCallback, useEffect, useState } from "react";
import type { LivePreview } from "../types";

type ReviewNavigationOptions = {
  preview: LivePreview | null;
  selectedPath?: string;
  onSelect: (path: string) => void;
  onToggleCompletion?: () => void;
};

export const useReviewNavigation = ({
  preview,
  selectedPath,
  onSelect,
  onToggleCompletion,
}: ReviewNavigationOptions) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const navigateFile = useCallback(
    (direction: -1 | 1) => {
      const index =
        preview?.files.findIndex((file) => file.path === selectedPath) ?? -1;
      if (index < 0) return;
      const file = preview?.files[index + direction];
      if (file) onSelect(file.path);
    },
    [preview, selectedPath, onSelect],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || !preview) return;
      const overlayOpen = document.querySelector(
        '[role="dialog"], [role="menu"], [role="listbox"], [data-slot="popover-content"]',
      );
      if (
        event.key.toLowerCase() === "k" &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey
      ) {
        if (overlayOpen && !searchOpen) return;
        event.preventDefault();
        if (!event.repeat) setSearchOpen((open) => !open);
        return;
      }
      if (
        searchOpen ||
        overlayOpen ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey
      )
        return;
      // Inspect the original target too: diff annotations live inside a shadow root.
      if (
        event
          .composedPath()
          .some(
            (target) =>
              target instanceof HTMLElement &&
              (target.isContentEditable ||
                target.closest(
                  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="combobox"], [role="slider"], [role="separator"]',
                )),
          )
      )
        return;
      if (event.key.toLowerCase() === "d" && onToggleCompletion) {
        event.preventDefault();
        if (!event.repeat) onToggleCompletion();
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      navigateFile(event.key === "ArrowLeft" ? -1 : 1);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [navigateFile, preview, searchOpen, onToggleCompletion]);

  return { searchOpen, setSearchOpen, navigateFile };
};
